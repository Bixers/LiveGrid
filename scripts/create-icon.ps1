$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$outputDirectory = Join-Path $PSScriptRoot '..\build'
$outputPath = Join-Path $outputDirectory 'icon.ico'
$previewPath = Join-Path $outputDirectory 'icon.png'
New-Item -ItemType Directory -Force $outputDirectory | Out-Null

$bitmap = New-Object System.Drawing.Bitmap 256, 256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

$blue = [System.Drawing.ColorTranslator]::FromHtml('#2457d6')
$white = [System.Drawing.Color]::White
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc(8, 8, 48, 48, 180, 90)
$path.AddArc(200, 8, 48, 48, 270, 90)
$path.AddArc(200, 200, 48, 48, 0, 90)
$path.AddArc(8, 200, 48, 48, 90, 90)
$path.CloseFigure()
$graphics.FillPath((New-Object System.Drawing.SolidBrush $blue), $path)

$ringPen = New-Object System.Drawing.Pen $white, 15
$graphics.DrawEllipse($ringPen, 48, 48, 160, 160)
$graphics.DrawEllipse($ringPen, 82, 82, 92, 92)
$graphics.FillEllipse((New-Object System.Drawing.SolidBrush $white), 113, 113, 30, 30)

$bitmap.Save($previewPath, [System.Drawing.Imaging.ImageFormat]::Png)
$pngStream = New-Object System.IO.MemoryStream
$bitmap.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $pngStream.ToArray()
$fileStream = [System.IO.File]::Create($outputPath)
$writer = New-Object System.IO.BinaryWriter $fileStream
$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]1)
$writer.Write([Byte]0)
$writer.Write([Byte]0)
$writer.Write([Byte]0)
$writer.Write([Byte]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]32)
$writer.Write([UInt32]$pngBytes.Length)
$writer.Write([UInt32]22)
$writer.Write($pngBytes)
$writer.Dispose()
$pngStream.Dispose()
$ringPen.Dispose()
$path.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Output $outputPath, $previewPath
