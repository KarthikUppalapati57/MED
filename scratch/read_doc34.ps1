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

Write-Output "===== DOC 3: MEVS SaaS Platform Audit Checklist ====="
Read-Docx "$basePath\MEVS SaaS Platform Audit Checklist.docx"
Write-Output ""
Write-Output "===== DOC 4: MEVS Production Code Audit Workbook ====="
Read-Docx "$basePath\MEVS Production Code Audit Workbook.docx"
