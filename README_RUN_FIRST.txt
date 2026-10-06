ARKAVATI RIVER POPULATION ASSESSMENT PROJECT - RUN FIRST
========================================================

1. Open PowerShell in this folder.
2. Run:
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
   .\PRODUCTION_SETUP.ps1
3. Review config\production.env.
4. Run .\RUN_PRODUCTION.ps1
5. Open http://127.0.0.1:8766 for local testing.

Before go-live:
- Rename Institution 01 ... Institution 12 to the real university/institution names.
- Test Institution -> Nakshatech -> CNNL approval workflow.
- Configure final HTTPS proxy/tunnel URL.
- Put Video+SRT pairs in production_data\video_srt_pairs\<DATE>\.

Read docs\PRODUCTION_DEPLOYMENT_GUIDE.md for the complete procedure.
