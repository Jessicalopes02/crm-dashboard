import { PublicClientApplication } from '@azure/msal-browser';

const tenantId =
  import.meta.env.VITE_MICROSOFT_TENANT_ID;

const clientId =
  import.meta.env.VITE_MICROSOFT_CLIENT_ID;

export const msalConfig = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin
  },

  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false
  }
};

export const loginRequest = {
  scopes: ['openid', 'profile', 'email']
};

export const msalInstance =
  new PublicClientApplication(msalConfig);