---
layout: post
title: BitLocker Certificate DRA
description: BitLocker Certificate Data Recovery Agent (DRA) managed by Microsoft Intune
categories: Intune
---
If you plan to manage your computers exclusively in Intune and/or plan to store BitLocker keys in Azure AD, you've wondered what happens to the BitLocker key when you remove the computer account from Azure AD.

It's simple. The BitLocker key will be removed along with the computer account. See [How to manage stale devices in Azure AD Microsoft Learn](https://learn.microsoft.com/en-us/azure/active-directory/devices/manage-stale-devices#plan-the-cleanup-of-your-stale-devices){:target="_blank"}.

So how do we avoid the situation where we remove the computer account from Azure AD and then find that we need to get to the data on the computer?
Certificate-based BitLocker Data Recovery Agent (DRA) will help. The following describes how to implement BitLocker Certificate DRA using Microsoft Intune.

# **Prepare certificate** [:link:](#Prepare-certificate)
To create a certificate with the necessary attributes, we will need a certificate authority. However, this article does not describe the ADCS implementation itself. There are many articles on the Internet on how to implement ADCS.

Now we need to create a new certificate template.

```powershell
$Cert = New-SelfSignedCertificate -Type Custom -Subject "CN=BitLockerDRA" -TextExtension @("2.5.29.37={text}1.3.6.1.4.1.311.21.6,1.3.6.1.4.311.67.1.1,1.3.6.1.4.1.311.67.1.2,2.23.133.8.3") -CertStoreLocation "Cert:\LocalMachine\My\" -HashAlgorithm sha256 -KeySpec Signature
$CertPassword = ConvertTo-SecureString -String "MyPassword" -Force -AsPlainText
$thumbprint = $Cert.Thumbprint
$Cert | Export-PfxCertificate -FilePath .\cert.pfx -Password $CertPassword
Get-ChildItem -Path .\cert.pfx | Import-PfxCertificate -CertStoreLocation "Cert:\LocalMachine\My\" -Password $CertPassword 
$Cert | Export-Certificate -FilePath cert.cer
```

## Create certificate template [:link:](#Create-Certificate-template)
1. Duplicate template "Key Recovery Agent" \
 ![Duplicate template](/assets/img/20230811-BitLockerDRA/1_DuplicateTemplate.png "Duplicate certificate template Key Recovery Agent")

2. Specify the template display name (alternatively template name) and validity period. \
  ![General](/assets/img/20230811-BitLockerDRA/2_Template_General.png "Tab General - set name and period") \
  :bulb: **Tip:** Certificate expiration is not that important because you can decrypt volumes even with an expired certificate.

3. Edit Application Policies \
  ![Edit Application Policies](/assets/img/20230811-BitLockerDRA/3_Template_Extensions.png "Tab Extensions - edit Applicaiton policies")
  ![Add OIDs](/assets/img/20230811-BitLockerDRA/4_Template_Extensions_Edit.png "Tab Extension - Add Application policies")
  ![Select OIDs](/assets/img/20230811-BitLockerDRA/5_Template_Extensions_Edit_Add.png "Tab Extension - Select OIDs") \
  :memo: **Note:** If you don't see "Bitlocker Data Recovery Agent" and "Bitlocker Drive Encryption" you can add them using the "New" button.
  - Bitlocker Drive Encryption: 1.3.6.1.4.1.311.67.1.1
  - Bitlocker Data Recovery Agent: 1.3.6.1.4.1.311.67.1.2
  <br />
  <br />

4. Edit Issuance Requirements \
  Deselect "CA certificate manager approwal".
  ![Edit Issuance Requirements](/assets/img/20230811-BitLockerDRA/6_Template_IssuanceRequirements.png "Tab Isuance Requirements")

5. Add permission to issue certificate \
  :memo: **Note:** By default groups "Domain Admins" and "Enterprise Admins" have permission to issue certificate by this template. But if you want to add another user, the add the user and allow Enroll for them. \
  ![Add permission to issue certificate](/assets/img/20230811-BitLockerDRA/7_Template_Security.png "Tab Security")

6. Publish the new certificate template \
  ![Configure Template to Issue](/assets/img/20230811-BitLockerDRA/9_Template_to_Issue.png "Configure Template to Issue")
  ![Select Template to Issue](/assets/img/20230811-BitLockerDRA/10_Template_to_Issue_Select.png "Select Template to Issue")

7. Request new certificate \
  New we prepared certificate teplate and we can request new certificate. \
  ![Request new certificate](/assets/img/20230811-BitLockerDRA/11_Request_new_cert.png "Request new certificate")
  ![Request new certificate](/assets/img/20230811-BitLockerDRA/12_Request_new_cert.png "Request new certificate") 

8. Export the certificate \
  :warning: **Warning:** This certificate will be highly sensitive because you will be able to decrypt all Bitlocker volumes in your organisation by this cert. So you should keep it secret.
  ![Export the certificate](/assets/img/20230811-BitLockerDRA/13_Export_Cert.png "Export the certificate")
  ![Export the certificate](/assets/img/20230811-BitLockerDRA/14_Export_Cert.png "Export the certificate")
  ![Export the certificate](/assets/img/20230811-BitLockerDRA/15_Export_Cert.png "Export the certificate") \
  Exported certificate will be used in next chapter.

# **Prepare PowerShell script for import certificate to computers** [:link:](#Prepare-PowerShell-script-for-import-certificate-to-computers)
Normaly, when the computer is part of on-premise Active Directory, we use GPO for distributing certificate. But when the computer is Azure AD Joined and is managed by Intune, then we have to import certificate directly to registry by a PowerShell script.

```
HKLM:\SOFTWARE\Policies\Microsoft\SystemCertificates\FVE\Certificates\<Certificate Thumbprint>
```
On test computer open Local Security Policy and import the certificate to the Bitlocker Drive Encryption.
![Import Certificate to Local Security Policy](/assets/img/20230811-BitLockerDRA/16_ImportToSecurityPolicies.png "Import Certificate to Local Security Policy")
This create certificate in registry. You need to export it to xml file.
```powershell
$Blob = Get-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\SystemCertificates\FVE\<Certificate thumbprint>" -Name "Blob"
$Blob.Blob | Export-Clixml -Path .\cert.xml
```

Now, we have need to prepare script. I wrote this one.
```powershell
$certThumbprint = "<Certificate thumbprint>"
$certValue = Import-Clixml -Path .\cert.xml

$RegKey = "HKLM:\SOFTWARE\Policies\Microsoft\SystemCertificates\FVE"
if (!(Test-Path $RegKey)) {
    New-Item -Path $RegKey
}

$RegKey = "HKLM:\SOFTWARE\Policies\Microsoft\SystemCertificates\FVE\Certificates"
if (!(Test-Path $RegKey)) {
    New-Item -Path $RegKey
}

$RegKey = "HKLM:\SOFTWARE\Policies\Microsoft\SystemCertificates\FVE\Certificates\" + $certThumbprint
if (!(Test-Path $RegKey)) {
    New-Item -Path $RegKey
}

New-ItemProperty -Path $RegKey -Name "Blob" -PropertyType Binary -Value $certValue -Force
```

# **Prepare Intune Configuration profiles** [:link:](#Prepare-Intune-Configuration-profiles)

## Win32 app with script [:link:](#Win32-app-with-script)

![Prepare Win32 app](/assets/img/20230811-BitLockerDRA/17_Win32App.png "Prepare Win32 app")

## Create Win32 app in Intune

