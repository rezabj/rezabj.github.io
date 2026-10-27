---
layout: "post"
title: "Deployment of large Windows apps by Microsoft Intune"
date: "2023-08-25 21:17:16 +0200"
permalink: "/intune/2023/08/25/deployment-of-large-windows-apps-by-microsoft-intune/"
categories: ["Intune"]
tags: ["Intune","Win32"]
description: "Microsoft Intune offers different ways to deploy applications. Or I could say, from different sources. For example, Microsoft store (new), Microsoft 365 Apps, Line-of-Business or Windows apps (Win32). In this article we will focus on the last mentioned option. That is, Windows apps (Win32)."
---

<details class="table-of-contents" open markdown="1">
<summary>Page Contents</summary>

* Contents
{:toc}

</details>

## Introduce
{: #Introduce}

Microsoft Intune offers different ways to deploy applications. Or I could say, from different sources. For example, Microsoft store (new), Microsoft 365 Apps, Line-of-Business or Windows apps (Win32). In this article we will focus on the last mentioned option. That is, Windows apps (Win32).

## Windows apps (Win32)
{: #Windows_apps_Win32}

Most Intune administrators commonly use this type of application deployment. Not everyone knows exactly how the application deployment process works on endpoint site. But this knowledge is important, especially when you are trying to deploy large applications.

Let’s recall the prerequisites for deploying Win32 applications.

-   Use Windows 10 version 1607 or later (Enterprise, Pro, or Education editions).
-   Devices must be enrolled in Intune and either:
    -   Azure AD registered
    -   Azure AD joined
    -   Hybrid Azure AD joined
-   Windows application size must not be greater than 8 GB per app.

Application installer must be packaged by [Microsoft Win32 Content Prep Tool](https://github.com/Microsoft/Microsoft-Win32-Content-Prep-Tool).

## Deploying process
{: #Deploying_process}

There are four parts of apps deployment process at the endpoint site.

## Downloading
{: #Downloading}

Intune agent download encrypted intunewin file to the folder “_C:\\Program Files (x86)\\Microsoft Intune Management Extension\\Content\\Incoming\\_“. Downloaded file has bin extension.

In the log file you can see this:

![Article illustration](/assets/images/2023/08/image-1024x96.png)

If your computers use Delivery Optimalization, the file is downloaded to the DO cache and then from DO cache to the _Incoming_ folder.

## Decrypting
{: #Decrypting}

When the file is successfully downloaded and verified then Intune Agent decrypt file to the folder “_C:\\Program Files (x86)\\Microsoft Intune Management Extension\\Content\\Staging\\_“. Decrypted file is ZIP file. In the log file you can see this:

![Article illustration](/assets/images/2023/08/image-1.png)

## Decompressing
{: #Decompressing}

The decrypted file is unzipped to the folder “`C:\Windows\IMECache\<app guid>`“. In the log file you can see this:

![Article illustration](/assets/images/2023/08/image-2.png)

## Installing
{: #Installing}

Yeah… When application installation start, you have the installation media on you C drive for 3 times (with DO 4 time). The cleaning process starts after the installation is complete. It does not matter if the installation was successful or not.

📑**Note:** Some applications (such as MATLAB) start another application installation process, and the process started by the Intune agent is terminated before the application installation is complete. Therefore, you must ensure that the Intune agent waits until the installation is complete. For example, using a PowerShell script.

## What about 8+ GBs applications?
{: #What_about_8_GBs_applications}

Yes, you can deploy bigger (8+ GBs) apps. But you must ask Microsoft support for enabling this posibility for your tenant.

I was preparing a MATLAB deployment using Microsoft Intune for a customer. The MATLAB installation files are about 22 GB in total. Deploying and testing such a large application is a challenge.

You will need a lot of time and patience. Especially if you don’t have a fast internet line.

In my case, I was working on a relatively slow line at first, and uploading the application to Intune using a web browser took a long time and was unreliable. Often the upload ended in an error. When your upload of an application to Intune not finished within an hour, the token expires and the upload is terminated. I solved it by uploading MATLAB application by PowerShell module [IntuneWin32App](https://www.powershellgallery.com/packages/IntuneWin32App).

Uploading the MATLAB app using IntuneWin32App module was stable and could easily last all night.

Of course, you also need a lot of space on the C drive. In my case, when I installed MATLAB, I needed 107 GB of free space on the C drive for the installation to be successful. Therefore, it is advisable to select the correct free space requirements in the Requirements section when preparing the installation in Intune.

| Folder | Size (GB) |
| --- | --- |
| Delivery Optimization cache folder | 22 |
| _C:\\Program Files (x86)\\Microsoft Intune Management Extension\\Content\\Incoming\\_ | 22 |
| _C:\\Program Files (x86)\\Microsoft Intune Management Extension\\Content\\Staging\\_ | 22 |
| `C:\Windows\IMECache\<app guid>` | 22 |
| C:\\Program Files\\MATLAB | 19 |
| Total | 107 |

After the installation is complete (whether successfully or unsuccessfully) the “_Incoming_“, “_Staging_” and “_IMECache_” directories are cleaned up. Cleaning of the Delivery Optimization cache depends on the DO settings.
