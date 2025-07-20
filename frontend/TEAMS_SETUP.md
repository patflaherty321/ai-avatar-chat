# Microsoft Teams App Setup Guide

This guide will help you set up your AI Avatar Chat app to work properly within Microsoft Teams with microphone access.

## Overview

Since Teams runs apps in a security sandbox, iframe embedding cannot access microphone permissions. The proper solution is to create a Teams app using the Microsoft Teams SDK and app manifest.

## Prerequisites

1. A Microsoft 365 account with Teams admin permissions
2. Your app deployed on Vercel (or another public URL)
3. Azure Active Directory app registration

## Step 1: Azure AD App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** > **App registrations**
3. Click **New registration**
4. Fill in the details:
   - **Name**: AI Avatar Chat
   - **Supported account types**: Accounts in any organizational directory (Any Azure AD directory - Multitenant)
   - **Redirect URI**: Web - `https://your-vercel-app.vercel.app/auth-end`
5. Click **Register**
6. Copy the **Application (client) ID** - you'll need this later

### Configure API Permissions

1. In your app registration, go to **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph**
4. Add these permissions:
   - `User.Read` (Delegated)
   - `offline_access` (Delegated)
5. Click **Grant admin consent** if you have admin rights

## Step 2: Update Teams Manifest

1. Open `teams-manifest.json` in your project
2. Replace the placeholder values:

```json
{
  "id": "YOUR_ACTUAL_APP_ID_HERE",
  "webApplicationInfo": {
    "id": "YOUR_AZURE_AD_CLIENT_ID_HERE"
  },
  "staticTabs": [
    {
      "contentUrl": "https://your-actual-vercel-app.vercel.app/",
      "websiteUrl": "https://your-actual-vercel-app.vercel.app/"
    }
  ],
  "validDomains": [
    "your-actual-vercel-app.vercel.app"
  ],
  "developer": {
    "websiteUrl": "https://your-actual-domain.com",
    "privacyUrl": "https://your-actual-domain.com/privacy",
    "termsOfUseUrl": "https://your-actual-domain.com/terms"
  }
}
```

## Step 3: Create App Icons

Create two icon files in the same directory as your manifest:

1. **icon-color.png**: 192x192 pixels, color version of your app icon
2. **icon-outline.png**: 32x32 pixels, white outline on transparent background

## Step 4: Create Teams App Package

1. Create a ZIP file containing:
   - `teams-manifest.json` (renamed to `manifest.json`)
   - `icon-color.png`
   - `icon-outline.png`

## Step 5: Upload to Teams

### Option A: Developer Tenant (Recommended for Testing)

1. Go to [Teams Admin Center](https://admin.teams.microsoft.com)
2. Navigate to **Teams apps** > **Manage apps**
3. Click **Upload new app**
4. Upload your ZIP file
5. Set permissions to allow the app

### Option B: Side-loading (For Development)

1. In Teams, go to **Apps**
2. Click **Upload a custom app** (bottom left)
3. Select **Upload for [your organization]**
4. Upload your ZIP file

## Step 6: Test Microphone Access

1. Add the app to Teams
2. Open the app tab
3. The app should now have proper microphone permissions
4. Test the microphone button - it should work without security restrictions

## Troubleshooting

### Microphone Still Not Working

1. **Check Teams Admin Policies**:
   - Ensure microphone access is allowed in Teams admin center
   - Check app permission policies

2. **Verify App Registration**:
   - Confirm the Azure AD app ID matches your manifest
   - Ensure redirect URIs are correct

3. **Browser Permissions**:
   - Check if Teams desktop app works better than web version
   - Verify microphone permissions in browser settings

### App Not Loading

1. **Check URLs**:
   - Ensure your Vercel app URL is correct and accessible
   - Verify HTTPS is working

2. **Manifest Validation**:
   - Use Teams App Studio to validate your manifest
   - Check for JSON syntax errors

## Alternative: Teams App Studio

For easier app creation, you can use Teams App Studio:

1. In Teams, search for "App Studio"
2. Install App Studio
3. Use it to create your app manifest visually
4. Export and upload the generated package

## Production Deployment

For production deployment to the Teams App Store:

1. Complete Partner Center registration
2. Submit your app for approval
3. Include detailed description and screenshots
4. Ensure compliance with Teams app policies

## Current Implementation Status

✅ **Completed**:
- Teams SDK integration in App.js
- Teams detection and initialization
- Permission handling with Teams API
- Teams-specific error messages

⏳ **Needs Configuration**:
- Replace placeholder IDs in teams-manifest.json
- Create and upload app icons
- Azure AD app registration
- Teams app package creation and upload

## Next Steps

1. **Generate Real App ID**: Use `uuidgen` command or online UUID generator
2. **Create Azure AD Registration**: Follow Step 1 above
3. **Update Manifest**: Replace all placeholder values
4. **Create Icons**: Design 192x192 and 32x32 pixel icons
5. **Package and Upload**: Create ZIP file and upload to Teams

Once these steps are complete, your AI Avatar Chat will have full microphone access within Microsoft Teams!
