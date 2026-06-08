Add-Type -AssemblyName System.IO.Compression.FileSystem
$path = "c:\Users\ukart\OneDrive - University of Tennessee\M\INtern\MECURSOR\MEVS\Notes\Landing Page Redirect Investigation Guide.docx"
$zip = [System.IO.Compression.ZipFile]::OpenRead($path)
$entry = $zip.Entries | Where-Object { $_.FullName -eq 'word/document.xml' }
$stream = $entry.Open()
$reader = New-Object System.IO.StreamReader($stream)
$xmlString = $reader.ReadToEnd()
$reader.Close()
$stream.Close()
$zip.Dispose()
$xml = [xml]$xmlString
$nsm = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
$nsm.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
$text = ($xml.SelectNodes('//w:t', $nsm) | ForEach-Object { $_.InnerText }) -join ''
Write-Output $text
