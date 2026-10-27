---
layout: post
title: Ověřování certifikátem v Azure Active Directory
description: Nenechávejte hesla uložená ve skriptech. Použijte ověřávní certifikátem.
categories: AzureAD
---
Každý IT administrátor řeší automatizaci. V prostředí Windows, Microsoft 365, Azure AD hodně často padne volba na skripty napsané v PowerShellu. Ty se většinou spouští na nějakém serveru firmy a bohužel dost často jsou ve skriptech uloženy přístupové údaje. Někdy i k účtům s hodně vysokým oprávněním. Nezřídka vidím u zákazníků, jak jejich skript obsahuje přístupové údaje globálního administrátora.

Optimálním řešením je využít [Azure Automation Account](https://docs.microsoft.com/en-us/azure/automation/overview) ve spojení s [Azure Key Vault](https://azure.microsoft.com/en-us/services/key-vault/#product-overview).

Pro ty, co přesto chtějí pouštět PowerShell skripty na svém on-prem serveru, je řešením autentifikace certifikátem. Pojďme si ukázat, jak na to.

V prvé řadě musíme mít certifikát. Pro tento účel nám bohatě stačí self sign certifikát. Následující blok příkazů vytvoří certifikát, vyexportuje ho do pfx souboru, smaže ho ze systému a znovu naimportuje jako neexportovatelný.
```powershell
$Cert = New-SelfSignedCertificate -Type Custom -Subject "CN=Skript account" -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.2,1.3.6.1.5.5.7.3.1") -CertStoreLocation "Cert:\LocalMachine\My\" -HashAlgorithm sha256 -KeySpec Signature
$CertPassword = ConvertTo-SecureString -String "MyPassword" -Force -AsPlainText
$thumbprint = $Cert.Thumbprint
$Cert | Export-PfxCertificate -FilePath .\cert.pfx -Password $CertPassword
Get-ChildItem -Path .\cert.pfx | Import-PfxCertificate -CertStoreLocation "Cert:\LocalMachine\My\" -Password $CertPassword 
$Cert | Export-Certificate -FilePath cert.cer
```
Soubor cert.pfx si někam bezpečně uložte a ze serveru ho vymažte. Soubor cert.cer budeme potřebovat při registraci aplikace v Azure AD.

Abychom se tímto certifikátem mohli začít přihlašovat, je potřeba nakonfigurovat Azure AD registrovanou aplikaci. Postupně si ukážeme přihlášení ke Graph API, Exchange i Azure Active Directory.

# Graph API
Přejděte do [App registrations](https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/RegisteredApps) a vytvořte novou aplikaci.
![App registration](/assets/img/20211028-certAAD/GraphAPI-App-Registration.png)

V aplikaci přejděte do Certificates & secrets a nahrajte certifikát (cert.cer).
![App cert upload](/assets/img/20211028-certAAD/GraphAPI-App-CertUpload.png)

Nyní nám už stačí jen aplikaci přidat potřebná práva na Graph API. Graph API má dva typy práv, delegovaná a aplikační. Při přihlašování certifikátem potřebujeme použít aplikační práva.
Například User.Read.All. Po přidání práv nezapomeňte udělit souhlas správce.
![App API Permission](/assets/img/20211028-certAAD/GraphAPI-App-APIPermission.png)

A teď už jen ukázka jednoduchého skriptu, kterým si přes Graph API vypíšete uživatele. Client ID a Tenant ID zjistíte z Overview registrované aplikace.
```powershell
Import-Module -Name MSAL.PS
Import-Module -Name DCToolbox
$ClientId   = "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
$TenantId   = "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
$Thumbprint = "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
$Certificate = Get-Item "Cert:\LocalMachine\My\$($Thumbprint)"
$Token = Get-MsalToken -ClientId $ClientId -TenantId $TenantId -ClientCertificate $Certificate -ErrorAction Stop  
$Uri = 'https://graph.microsoft.com/beta/users'
$Users = Invoke-DCMsGraphQuery -AccessToken $Token.AccessToken -GraphMethod GET -GraphUri $Uri
$Users | ft
```
# Exchange Online
Exchange má podobný postup. Také vytvoříme aplikaci a nahrajeme certifikát. Navíc je ale potřeba upravit manifest aplikace.
V manifestu vyhledejte
```json
"requiredResourceAccess": [
	{
		"resourceAppId": "00000003-0000-0000-c000-000000000000",
		"resourceAccess": [
			{
				"id": "e1fe6dd8-ba31-4d61-89e7-88639da4683d",
				"type": "Scope"
			}
		]
	}
],
```
A nahraďte ho 
```json
"requiredResourceAccess": [
  {
    "resourceAppId": "00000002-0000-0ff1-ce00-000000000000",
    "resourceAccess": [
      {
        "id": "dc50a0fb-09a3-484d-be87-e023b12c6440",
        "type": "Role"
      }
    ]
  }
],
```
![EXO App Manifest](/assets/img/20211028-certAAD/EXO-App-Manifest.png)

Jakmile manifest uložíme, tak se nám v sekci API permissions objeví právo Exchange.ManageAsApp. Nezapomeňte udělit souhlas spárvce.
![EXO App API Permission](/assets/img/20211028-certAAD/EXO-App-APIPermission.png)

Nyní musíme této aplikaci (service principal) ještě přidat roli Exchange Administrator. Přejděte v [Azure AD](https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/RolesAndAdministrators) do Roles and administrators a vyhledejte roli Exchange administrator a přidejte nově vytvořenou aplikaci (service principal).
![EXO App Exch Role assign](/assets/img/20211028-certAAD/EXO-APP-ExchPermission.png)

Postup přihlášení ve skriptu bude následující:
```powershell
$ClientId   = "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
$TenantName = "OrgName.onmicrosoft.com"
$Thumbprint = "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
Import-Module -Name ExchangeOnlineManagement
Connect-ExchangeOnline -AppId $ClientId -CertificateThumbprint $Thumbprint -Organization $TenantName
Get-Mailbox
```

# Azure Active Directory
Pro Azure Active Directory je to ještě jednodušší. Stačí nám zaregistrovat aplikaci jako v předchozích dvou případech. Nemusíme ani upravovat manifest, ani přiřazovat práva v API permissions. Stačí aplikaci (service principal) přiřadit odpovídající práva. Například Global reader. V [AzureAD](https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/RolesAndAdministrators) v sekci Roles and administrators vyhledejte příslušnou roli a přidělte práva.

Poté již můžeme použít postup:

```powershell
$ClientId   = "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
$TenantId   = "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
$Thumbprint = "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
Import-Module -Name AzureAD
Connect-AzureAD -TenantID $TenantId -ApplicationId $ClientId -CertificateThumbprint $Thumbprint
Get-AzureADUser
```

# Závěr
Je to jednoduché a zároveň bezpečnější, než nechávat uživatelské jméno a heslo uložené někde ve skriptu, kde si to může přečíst každý kolemjdoucí. :-)