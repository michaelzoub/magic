import { createCipheriv, createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { chromeTimeToUnixSeconds, cookieUrl, decryptCookieValue, deriveKey, toCookieDetails } from './chrome-import'

const key = deriveKey('test-password')

function encrypt(plain: Buffer): Buffer {
  const cipher = createCipheriv('aes-128-cbc', key, Buffer.alloc(16, ' '))
  return Buffer.concat([Buffer.from('v10'), cipher.update(plain), cipher.final()])
}

const row = {
  host_key: '.example.com', name: 'sid', value: '', enc: '', path: '/',
  expires_utc: 13_444_473_600_000_000, is_secure: 1, is_httponly: 1, has_expires: 1, samesite: -1
}

describe('chrome cookie import', () => {
  it('round-trips a v10 cookie value', () => {
    expect(decryptCookieValue(encrypt(Buffer.from('abc123')), key, '.example.com')).toBe('abc123')
  })

  it('strips the SHA-256 host prefix newer Chrome prepends', () => {
    const prefixed = Buffer.concat([createHash('sha256').update('.example.com').digest(), Buffer.from('tok')])
    expect(decryptCookieValue(encrypt(prefixed), key, '.example.com')).toBe('tok')
  })

  it('rejects non-v10 values and bad ciphertext', () => {
    expect(decryptCookieValue(Buffer.from('plaintext'), key, '.example.com')).toBeNull()
    expect(decryptCookieValue(Buffer.from('v10short'), key, '.example.com')).toBeNull()
  })

  it('converts Chrome timestamps and builds cookie URLs', () => {
    expect(chromeTimeToUnixSeconds(13_444_473_600_000_000)).toBe(1_800_000_000)
    expect(cookieUrl(row)).toBe('https://example.com/')
  })

  it('maps rows to Electron cookie details and drops expired cookies', () => {
    expect(toCookieDetails(row, 'v', 1_700_000_000)).toMatchObject({
      url: 'https://example.com/', name: 'sid', value: 'v', domain: '.example.com',
      secure: true, httpOnly: true, expirationDate: 1_800_000_000, sameSite: 'unspecified'
    })
    expect(toCookieDetails(row, 'v', 1_900_000_000)).toBeNull()
  })
})
