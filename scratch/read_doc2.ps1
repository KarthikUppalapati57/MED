Add-Type -AssemblyName System.IO.Compression.FileSystem

function Read-Docx {
    param([string]$path)
    $zip = [System.IO.Compression.ZipFile]::OpenRead($path)
    $entry = $zip.Entries | Where-Object { $_.FullName -eq 'word/document.xml' }
    if ($entry) {
        $stream = $entry.Open()
        $reader = New-Object System.IO.StreamReader($stream)
        $xml = $reader.ReadToEnd()
        $reader.Close()
        $stream.Close()
        $text = $xml -replace '<[^>]+>', "`n"
        $text = $text -replace '(\r?\n){3,}', "`n`n"
        Write-Output $text.Trim()
    }
    $zip.Dispose()
}

$basePath = "c:\Users\ukart\OneDrive - University of Tennessee\M\INtern\MECURSOR\MEVS\Notes"

Write-Output "===== DOC 2: MEVS vs MarginEdge Gap Report ====="
Read-Docx "$basePath\MEVS_vs_MarginEdge_Latest_Platform_Gap_Report.docx"
