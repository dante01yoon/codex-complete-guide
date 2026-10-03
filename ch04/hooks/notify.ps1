$p = [Console]::In.ReadToEnd() | ConvertFrom-Json
$msg = if ($p.last_assistant_message) { $p.last_assistant_message } else { '작업을 마쳤습니다' }
if ($msg.Length -gt 200) { $msg = $msg.Substring(0, 200) }
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null
$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$t = $xml.GetElementsByTagName('text')
$t.Item(0).AppendChild($xml.CreateTextNode('Codex')) | Out-Null
$t.Item(1).AppendChild($xml.CreateTextNode($msg)) | Out-Null
$appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show([Windows.UI.Notifications.ToastNotification]::new($xml)) | Out-Null
exit 0
