To rebuild the dashboard from a fresh Arkavathi export:
1. Copy your Output(2).zip (or equivalent ZIP containing Day_3.xlsx ... Day_8.xlsx and Projections/Merged.kmz) into this folder.
2. From the backend folder run:
   python scripts/import_output_zip.py ../data_input/Output(2).zip
3. Restart the backend.

The repository already includes processed JSON generated from the user's supplied Output(2).zip, so this step is NOT required for the first demo.
