---
layout: "post"
title: "BitLocker Certificate DRA"
date: "2023-08-14 12:00:00 +0200"
permalink: "/intune/2023/08/14/bitlocker-certificate-dra-managed-by-intune-html/"
categories: ["Intune"]
tags: ["BitLocker","Intune","PowerShell"]
description: "If you plan to manage your computers exclusively in Intune and/or plan to store BitLocker keys in Azure AD, you’ve wondered what happens to the BitLocker key when you remove the computer account from Azure AD. It’s simple. The BitLocker key will be removed along with the computer account. See How to manage stale devices in…"
image: "/assets/images/2023/08/turn_on_bitlocker_encryption_windows_11_home.webp"
---

<details class="table-of-contents" open markdown="1">
<summary>Page Contents</summary>

* Contents
{:toc}

</details>

If you plan to manage your computers exclusively in Intune and/or plan to store BitLocker keys in Azure AD, you’ve wondered what happens to the BitLocker key when you remove the computer account from Azure AD.

It’s simple. The BitLocker key will be removed along with the computer account. See [How to manage stale devices in Azure AD Microsoft Learn](https://learn.microsoft.com/en-us/azure/active-directory/devices/manage-stale-devices#plan-the-cleanup-of-your-stale-devices).

So how do we avoid the situation where we remove the computer account from Azure AD and then find that we need to get to the data on the computer? Certificate-based BitLocker Data Recovery Agent (DRA) will help. The following describes how to implement BitLocker Certificate DRA using Microsoft Intune.

## **Prepare certificate**
{: #Prepare_certificate}

You can choose between a self-signed certificate and a certificate signed by a certificate authority.

You can create a self-signed certificate simply by using PowerShell:

```powershell
$Cert = New-SelfSignedCertificate -Type Custom -Subject "CN=Bitlocker DRA" -TextExtension @("2.5.29.37={text}2.23.133.8.3,1.3.6.1.4.1.311.21.6,1.3.6.1.4.1.311.67.1.1,1.3.6.1.4.1.311.67.1.2") -CertStoreLocation "Cert:\CurrentUser\My\" -HashAlgorithm sha512 -KeySpec KeyExchange
$CertPassword = ConvertTo-SecureString -String "MyPassword" -Force -AsPlainText
$thumbprint = $Cert.Thumbprint
$Cert | Export-PfxCertificate -FilePath .\cert.pfx -Password $CertPassword
Get-ChildItem -Path .\cert.pfx | Import-PfxCertificate -CertStoreLocation "Cert:\CurrentUser\My\" -Password $CertPassword 
$Cert | Export-Certificate -FilePath cert.cer
```

### **Create certificate template**
{: #Create_certificate_template}

To create a CA-signed certificate, you need a CA. However, this article does not describe the implementation of ADCS as there are many articles on the Internet that describe this.

**1) Duplicate template “Key Recovery Agent”**

![Duplicate template](/assets/images/2023/08/1_DuplicateTemplate.png)

**2) Specify the template display name (alternatively template name) and validity period**

![Tab General - set name and perios](/assets/images/2023/08/2_Template_General.png)

💡**Tip:** Certificate expiration is not that important because you can decrypt volumes even with an expired certificate.

**3) Edit Application Policies**

![Tab extensions - edit Application Policies](/assets/images/2023/08/3_Template_Extensions.png)

![Tab extensions - edit Application Policies](/assets/images/2023/08/4_Template_Extensions_Edit.png)

![Tab extensions - edit Application Policies](/assets/images/2023/08/5_Template_Extensions_Edit_Add.png)

📑**Note:** If you don’t see “BitLocker Data Recovery Agent” and “Bitlocker Drive Encryption” you can add them using the “New” button.

-   Bitlocker Drive Encryption: 1.3.6.1.4.1.311.67.1.1
-   Bitlocker Data Recovery Agent: 1.3.6.1.4.1.311.67.1.2

**4) Edit Issuance Requirements**

Deselect “CA certificate manager approwal”.

![Tab Isuance Requirements](/assets/images/2023/08/6_Template_IssuanceRequirements.png)

**5) Add permission to issue certificate**

📑**Note:** By default groups “Domain Admins” and “Enterprise Admins” have permission to issue certificate by this template. But if you want to add another user, the add the user and allow Enroll for them.

![Tab Security](/assets/images/2023/08/7_Template_Security.png)

**6) Publish the new certificate template**

![Certificate template to Issue](/assets/images/2023/08/9_Template_to_Issue.png)

![Enable certificate template](/assets/images/2023/08/10_Template_to_Issue_Select.png)

**7) Request new certificate**

New we prepared certificate teplate and we can request new certificate.

![Request new certificate](/assets/images/2023/08/11_Request_new_cert.png)

![Request new certificate](/assets/images/2023/08/12_Request_new_cert.png)

8) Export the certificate

⚠️**Warning:** This certificate is very sensitive as it will allow you to unlock/decrypt all Bitlocker volumes in your organization. Therefore, you should keep it on a secure device (perhaps some kind of hardware token).

![Export the certificate](/assets/images/2023/08/13_Export_Cert.png)

![Export the certificate](/assets/images/2023/08/14_Export_Cert.png)

![Export the certificate](/assets/images/2023/08/15_Export_Cert.png)

Exported certificate will be used in next chapter.

## **Prepare PowerShell script for import certificate to computers**
{: #Prepare_PowerShell_script_for_import_certificate_to_computers}

Normaly, when the computer is part of on-premise Active Directory, you use GPO for distributing the certificate. But when the computer is Azure AD Joined and is managed by Intune, then you have to import certificate directly to registry by a PowerShell script.

```text
HKLM:\SOFTWARE\Policies\Microsoft\SystemCertificates\FVE\Certificates\<Certificate Thumbprint>
```

On test computer open Local Security Policy and import the certificate to the Bitlocker Drive Encryption.

![Import Certificate to Local Security Policy](/assets/images/2023/08/16_ImportToSecurityPolicies.png)

Local security policy stores the certificate in the registry. The created registry key needs to be exported to an xml file. This file is then used for importing on other computers.

```powershell
$Blob = Get-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\SystemCertificates\FVE\Certificates\<Certificate thumbprint>" -Name "Blob"
$Blob.Blob | Export-Clixml -Path .\cert.xml
```

Here is example of simple script. Save it as “ImportCert.ps1″ and change the $certThumprint” variable.

```powershell
$certThumbprint = "<Certificate thumbprint>"
$certValue = Import-Clixml -Path .\cert.xml

$RegKey = "HKLM:\SOFTWARE\Policies\Microsoft\SystemCertificates\FVE\Certificates\" + $certThumbprint
if (!(Test-Path $RegKey)) {
    New-Item -Path $RegKey -Force
}

New-ItemProperty -Path $RegKey -Name "Blob" -PropertyType Binary -Value $certValue -Force
```

## **Prepare Intune Configuration profiles**
{: #Prepare_Intune_Configuration_profiles}

### **Win32 app with script**
{: #Win32_app_with_script}

By [Microsoft Win32 Content Prep Tool](https://github.com/Microsoft/Microsoft-Win32-Content-Prep-Tool) you can prepare script package. Save script and xml file to a folder and run:

```text
.\IntuneWinAppUtil.exe -c .\Script -s ImportCert.ps1 -o .\Output
```

![Article illustration](/assets/images/2023/08/17_Win32App-1024x603.jpg)

Now, you can create new Win32App in Intune.

**Install command:**

```text
%windir%\SysNative\WindowsPowershell\v1.0\PowerShell.exe -ExecutionPolicy Bypass -File ImportCert.ps1
```

![Install command](/assets/images/2023/08/18_Win32App_InstallCommand-1024x475.png)

**Detection rule:**

```text
HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\SystemCertificates\FVE\Certificates\<Certificate thumbprint>
```

![Detection rule](/assets/images/2023/08/19_Win32App_DetectionRule-1024x627.png)

Deploy created app to computers.

### **BitLocker configuration profiles**
{: #BitLocker_configuration_profiles}

You have to deploy two BitLocker configuration profiles. One which setup BitLocker and second which setup BitLocker identifier. The first one can looks like this:

![BitLocker settings](/assets/images/2023/08/20_BitLocker_settings-1024x664.png)

⚠️**Warning:** The **“Certificate-based data recovery agent”** parameter has to be set to **“Not configured”**.

BitLocker identifier can be setup by “Settings catalog” policy and it is a string. For example name of your company.

![BitLocker identifiers](/assets/images/2023/08/21_BitLocker_identifiers-1024x506.png)

![BitLocker identifiers](/assets/images/2023/08/22_BitLocker_identifiers-1024x497.png)

If everything works as expected, you can restart computer and check the BitLocker settings on the test computer.

![BitLocker protectors](/assets/images/2023/08/23_BitLocker_protectors.png)

And when you connect the disks to the computer where is the certificate with private key, you can unlock volume by

```text
manage-bde.exe -unlock <Driver letter> -cert -ct <certificate thumbprint>
```

![BitLocker unlock](/assets/images/2023/08/24_BitLocker_unlock-1013x1024.jpg)
