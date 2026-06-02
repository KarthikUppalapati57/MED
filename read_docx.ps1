Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath = "c:\Users\ukart\OneDrive - University of Tennessee\M\INtern\MECURSOR\MEVS\Notes\EdgeOps Browser Compatibility Checklist.docx"
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$entry = $zip.Entries | Where-Object { $_.FullName -eq 'word/document.xml' }
if ($entry) {
    $stream = $entry.Open()
    $reader = New-Object System.IO.StreamReader($stream)
    $xml = $reader.ReadToEnd()
    $reader.Close()
    $stream.Close()
    $text = $xml -replace '<[^>]+>', ' '
    $text = $text -replace '\s+', ' '
    Write-Output $text
} else {
    Write-Output "document.xml not found."
}
$zip.Dispose()
