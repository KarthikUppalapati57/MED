import runpy
import sys
import tempfile


tempfile.tempdir = r"C:\tmp"
sys.argv = [
    "render_docx.py",
    "Notes/MEVS_vs_MarginEdge_Latest_Platform_Gap_Report.docx",
    "--output_dir",
    "Notes/latest_gap_render",
    "--emit_pdf",
]
runpy.run_path(
    r"C:\Users\ukart\.codex\plugins\cache\openai-primary-runtime\documents\26.601.10930\skills\documents\render_docx.py",
    run_name="__main__",
)
