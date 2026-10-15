import { useEffect, useRef, useState } from 'react'
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'

type Props = {
  src: string
  heading?: number | null
  alt?: string
  onImageError?: () => void
}

type PanoramaController = {
  rotate: (dx: number, dy: number) => void
  zoom: (delta: number) => void
  reset: () => void
  dispose: () => void
}

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_position;
void main() {
  v_position = a_position;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`

const FRAGMENT_SHADER = `
precision mediump float;
varying vec2 v_position;
uniform sampler2D u_texture;
uniform float u_aspect;
uniform float u_yaw;
uniform float u_pitch;
uniform float u_fov;

const float PI = 3.14159265358979323846264;

void main() {
  float halfFov = radians(u_fov) * 0.5;
  float scale = tan(halfFov);
  vec3 ray = normalize(vec3(v_position.x * u_aspect * scale, v_position.y * scale, -1.0));

  float cp = cos(u_pitch);
  float sp = sin(u_pitch);
  ray = vec3(ray.x, cp * ray.y - sp * ray.z, sp * ray.y + cp * ray.z);

  float cy = cos(u_yaw);
  float sy = sin(u_yaw);
  ray = vec3(cy * ray.x + sy * ray.z, ray.y, -sy * ray.x + cy * ray.z);

  float longitude = atan(ray.x, -ray.z);
  float latitude = asin(clamp(ray.y, -1.0, 1.0));
  float u = fract(longitude / (2.0 * PI) + 0.5);
  float v = 0.5 - latitude / PI;

  gl_FragColor = texture2D(u_texture, vec2(u, clamp(v, 0.001, 0.999)));
}`

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Unable to create panorama WebGL shader.')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unknown WebGL shader error.'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function createProgram(gl: WebGLRenderingContext) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  const program = gl.createProgram()
  if (!program) throw new Error('Unable to create panorama WebGL program.')
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Unable to link panorama WebGL program.'
    gl.deleteProgram(program)
    throw new Error(message)
  }
  return program
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360
}

export function StreetPanorama360({ src, heading = null, alt = '360 degree street panorama', onImageError }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const controllerRef = useRef<PanoramaController | null>(null)
  const onImageErrorRef = useRef(onImageError)
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>('loading')
  const [viewYaw, setViewYaw] = useState(0)
  const [viewPitch, setViewPitch] = useState(0)
  const [viewFov, setViewFov] = useState(72)
  const [fallbackMessage, setFallbackMessage] = useState('')


  useEffect(() => {
    onImageErrorRef.current = onImageError
  }, [onImageError])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !src) return

    setStatus('loading')
    setFallbackMessage('')
    setViewYaw(0)
    setViewPitch(0)
    setViewFov(72)

    let disposed = false
    let resizeObserver: ResizeObserver | null = null
    let gl: WebGLRenderingContext | null = null
    let program: WebGLProgram | null = null
    let texture: WebGLTexture | null = null
    let buffer: WebGLBuffer | null = null
    let image: HTMLImageElement | null = null
    let failed = false

    const yaw = { value: 0 }
    const pitch = { value: 0 }
    const fov = { value: 72 }

    try {
      gl = canvas.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: false })
      if (!gl) throw new Error('WebGL is unavailable in this browser.')
      program = createProgram(gl)
      buffer = gl.createBuffer()
      texture = gl.createTexture()
      if (!buffer || !texture) throw new Error('Unable to initialize the 360 panorama renderer.')

      gl.useProgram(program)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 1, -1, -1, 1,
        -1, 1, 1, -1, 1, 1
      ]), gl.STATIC_DRAW)

      const position = gl.getAttribLocation(program, 'a_position')
      gl.enableVertexAttribArray(position)
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

      const textureLocation = gl.getUniformLocation(program, 'u_texture')
      const aspectLocation = gl.getUniformLocation(program, 'u_aspect')
      const yawLocation = gl.getUniformLocation(program, 'u_yaw')
      const pitchLocation = gl.getUniformLocation(program, 'u_pitch')
      const fovLocation = gl.getUniformLocation(program, 'u_fov')
      gl.uniform1i(textureLocation, 0)

      const resize = () => {
        if (!gl || disposed) return
        const rect = canvas.getBoundingClientRect()
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        const width = Math.max(2, Math.round(rect.width * dpr))
        const height = Math.max(2, Math.round(rect.height * dpr))
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width
          canvas.height = height
        }
        gl.viewport(0, 0, width, height)
      }

      const draw = () => {
        if (!gl || !program || disposed || failed) return
        resize()
        gl.useProgram(program)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.uniform1f(aspectLocation, canvas.width / Math.max(1, canvas.height))
        gl.uniform1f(yawLocation, yaw.value * Math.PI / 180)
        gl.uniform1f(pitchLocation, pitch.value * Math.PI / 180)
        gl.uniform1f(fovLocation, fov.value)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }

      const syncUi = () => {
        setViewYaw(Math.round(normalizeDegrees(yaw.value)))
        setViewPitch(Math.round(pitch.value))
        setViewFov(Math.round(fov.value))
      }

      controllerRef.current = {
        rotate(dx, dy) {
          yaw.value -= dx * 0.18
          pitch.value = Math.max(-82, Math.min(82, pitch.value + dy * 0.15))
          syncUi()
          draw()
        },
        zoom(delta) {
          fov.value = Math.max(30, Math.min(100, fov.value + delta))
          syncUi()
          draw()
        },
        reset() {
          yaw.value = 0
          pitch.value = 0
          fov.value = 72
          syncUi()
          draw()
        },
        dispose() {}
      }

      resizeObserver = new ResizeObserver(() => draw())
      resizeObserver.observe(canvas)

      image = new Image()
      image.crossOrigin = 'anonymous'
      image.decoding = 'async'
      image.onload = () => {
        if (!gl || disposed) return
        try {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, texture)
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image!)
          setStatus('ready')
          requestAnimationFrame(draw)
        } catch (error) {
          failed = true
          setFallbackMessage(error instanceof Error ? error.message : 'The browser could not use this panorama as a WebGL texture.')
          setStatus('fallback')
        }
      }
      image.onerror = () => {
        if (disposed) return
        onImageErrorRef.current?.()
      }
      image.src = src
    } catch (error) {
      failed = true
      setFallbackMessage(error instanceof Error ? error.message : String(error))
      setStatus('fallback')
    }

    return () => {
      disposed = true
      dragRef.current = null
      resizeObserver?.disconnect()
      if (image) {
        image.onload = null
        image.onerror = null
        image.src = ''
      }
      if (gl) {
        if (texture) gl.deleteTexture(texture)
        if (buffer) gl.deleteBuffer(buffer)
        if (program) gl.deleteProgram(program)
      }
      controllerRef.current = null
    }
  }, [src])

  function pointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (status !== 'ready') return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
  }

  function pointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId || status !== 'ready') return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    drag.x = event.clientX
    drag.y = event.clientY
    controllerRef.current?.rotate(dx, dy)
  }

  function pointerEnd(event: React.PointerEvent<HTMLCanvasElement>) {
    if (dragRef.current?.id === event.pointerId) dragRef.current = null
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* pointer may already be released */ }
  }

  function wheel(event: React.WheelEvent<HTMLCanvasElement>) {
    if (status !== 'ready') return
    event.preventDefault()
    controllerRef.current?.zoom(event.deltaY > 0 ? 5 : -5)
  }

  function keyDown(event: React.KeyboardEvent<HTMLCanvasElement>) {
    if (status !== 'ready') return
    if (event.key === 'ArrowLeft') { event.preventDefault(); controllerRef.current?.rotate(35, 0) }
    if (event.key === 'ArrowRight') { event.preventDefault(); controllerRef.current?.rotate(-35, 0) }
    if (event.key === 'ArrowUp') { event.preventDefault(); controllerRef.current?.rotate(0, -25) }
    if (event.key === 'ArrowDown') { event.preventDefault(); controllerRef.current?.rotate(0, 25) }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); controllerRef.current?.zoom(-5) }
    if (event.key === '-') { event.preventDefault(); controllerRef.current?.zoom(5) }
    if (event.key === '0') { event.preventDefault(); controllerRef.current?.reset() }
  }

  if (status === 'fallback') {
    return <div className="relative h-full w-full bg-black">
      <img src={src} alt={alt} onError={onImageError} className="h-full w-full object-contain" />
      <div className="absolute inset-x-3 bottom-3 rounded-xl bg-black/75 px-3 py-2 text-center text-[11px] font-semibold text-amber-100 backdrop-blur">
        This capture is marked as 360°, but interactive WebGL rendering is unavailable. Showing the original panorama image. {fallbackMessage}
      </div>
    </div>
  }

  return <div className="relative h-full w-full overflow-hidden bg-black select-none">
    <canvas
      ref={canvasRef}
      tabIndex={0}
      aria-label={alt}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerEnd}
      onPointerCancel={pointerEnd}
      onWheel={wheel}
      onKeyDown={keyDown}
      onDoubleClick={() => controllerRef.current?.reset()}
      className="h-full w-full cursor-grab touch-none outline-none active:cursor-grabbing focus:ring-2 focus:ring-inset focus:ring-sky-400"
    />

    {status === 'loading' && <div className="pointer-events-none absolute inset-0 grid place-items-center bg-slate-950 text-white">
      <div className="rounded-xl bg-black/60 px-4 py-3 text-center">
        <div className="text-sm font-black">Loading 360° panorama…</div>
        <div className="mt-1 text-[11px] text-slate-300">Preparing interactive spherical view</div>
      </div>
    </div>}

    {status === 'ready' && <>
      <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-emerald-600/90 px-2.5 py-1.5 text-[10px] font-black text-white shadow backdrop-blur">360° PANORAMA · DRAG TO LOOK AROUND</div>
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 opacity-70" />
      <div className="absolute bottom-3 left-3 rounded-lg bg-black/70 px-2.5 py-1.5 text-[10px] font-bold text-white backdrop-blur">
        View {viewYaw}° · Tilt {viewPitch}° · FOV {viewFov}°{typeof heading === 'number' ? ` · Capture heading ${Math.round(normalizeDegrees(heading))}°` : ''}
      </div>
      <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
        <button type="button" onClick={() => controllerRef.current?.zoom(-8)} title="Zoom in" className="grid h-8 w-8 place-items-center rounded-lg bg-black/70 text-white hover:bg-black/85"><ZoomIn size={15} /></button>
        <button type="button" onClick={() => controllerRef.current?.zoom(8)} title="Zoom out" className="grid h-8 w-8 place-items-center rounded-lg bg-black/70 text-white hover:bg-black/85"><ZoomOut size={15} /></button>
        <button type="button" onClick={() => controllerRef.current?.reset()} title="Reset view" className="grid h-8 w-8 place-items-center rounded-lg bg-black/70 text-white hover:bg-black/85"><RotateCcw size={15} /></button>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-3 text-center"><span className="rounded-full bg-black/55 px-3 py-1 text-[10px] font-bold text-white/90 backdrop-blur">Mouse drag / touch drag · wheel to zoom · double-click to reset</span></div>
    </>}
  </div>
}
