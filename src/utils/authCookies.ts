import { CookieOptions, Request, Response } from 'express';

import { ACCESS_TOKEN_MAX_AGE_MS, REFRESH_TOKEN_MAX_AGE_MS } from './tokens';

export const ACCESS_COOKIE = 'accessToken';
export const REFRESH_COOKIE = 'refreshToken';

// Cookies are only marked Secure when the site is served over HTTPS.
const isSecure = () =>
    process.env.COOKIE_SECURE
        ? process.env.COOKIE_SECURE === 'true'
        : (process.env.FRONTEND_ORIGIN ?? '').startsWith('https://');

const sameSite = (): 'strict' | 'lax' | 'none' => {
    const value = (process.env.COOKIE_SAMESITE ?? '').toLowerCase();
    return value === 'lax' || value === 'none' ? value : 'strict';
};

// HttpOnly keeps the tokens out of reach of page scripts. The refresh token is
// only ever sent to the user endpoints, the access token to the API.
const baseOptions = (): CookieOptions => ({
    httpOnly: true,
    secure: isSecure() || sameSite() === 'none',
    sameSite: sameSite(),
});
const accessOptions = (): CookieOptions => ({
    ...baseOptions(),
    path: '/api/hf',
});
const refreshOptions = (): CookieOptions => ({
    ...baseOptions(),
    path: '/api/hf/user',
});

export function setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string
) {
    res.cookie(ACCESS_COOKIE, accessToken, {
        ...accessOptions(),
        maxAge: ACCESS_TOKEN_MAX_AGE_MS,
    });
    res.cookie(REFRESH_COOKIE, refreshToken, {
        ...refreshOptions(),
        maxAge: REFRESH_TOKEN_MAX_AGE_MS,
    });
}

export function clearAuthCookies(res: Response) {
    res.clearCookie(ACCESS_COOKIE, accessOptions());
    res.clearCookie(REFRESH_COOKIE, refreshOptions());
}

const stringOrUndefined = (value: unknown) =>
    typeof value === 'string' && value !== '' ? value : undefined;

/** Browsers send the access cookie; API clients may use an Authorization header. */
export function readAccessToken(req: Request): string | undefined {
    const bearer = req.headers.authorization?.split(' ')[1];
    return (
        stringOrUndefined(bearer) ??
        stringOrUndefined(req.cookies?.[ACCESS_COOKIE])
    );
}

/** Browsers send the refresh cookie; API clients may put it in the request body. */
export function readRefreshToken(req: Request): string | undefined {
    return (
        stringOrUndefined(req.cookies?.[REFRESH_COOKIE]) ??
        stringOrUndefined(req.body?.refreshToken)
    );
}
