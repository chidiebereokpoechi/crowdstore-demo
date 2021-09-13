import { createHash } from 'crypto'

export const hash = (contents: string | Buffer): string => {
    const sha256 = createHash('sha256')
    sha256.update(contents)
    return sha256.digest().toString('hex')
}
