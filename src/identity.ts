// import { classToPlain } from 'class-transformer'
import * as rsa from 'node-rsa'
import { Serializable } from './serializable'

export interface Keys {
    private: string
    public: string
}

export class Identity extends Serializable {
    private readonly __private: rsa
    private readonly __public: rsa
    private keys: Keys

    public get private(): string {
        return this.keys.private
    }

    public get public(): string {
        return this.keys.public
    }

    constructor() {
        super()
        this.__private = new rsa({ b: 256 })
        this.__public = new rsa({ b: 256 })
        this.keys = { private: '', public: '' }
    }

    private setUp(keys?: Keys): void {
        this.keys = keys ?? this.exportKeys()
    }

    public encrypt(input: Buffer): Buffer {
        return this.__public.encrypt(input)
    }

    public decrypt(input: Buffer): Buffer {
        return this.__private.decrypt(input)
    }

    public generateKeys(): void {
        const keyPair = new rsa({ b: 1024 }).generateKeyPair()
        const keys = {
            private: keyPair.exportKey('pkcs1-private'),
            public: keyPair.exportKey('pkcs1-public'),
        }

        this.importKeys(keys)
        this.setUp(keys)
    }

    public importKeys(keys: Keys): boolean {
        try {
            this.__private.importKey(keys.private, 'pkcs1-private')
            this.__public.importKey(keys.public, 'pkcs1-public')

            this.setUp(keys)
            return true
        } catch (e) {
            if (e instanceof Error) console.error(e.message)
            return false
        }
    }

    public exportKeys(): Keys {
        return {
            private: this.__private.exportKey('pkcs1-private'),
            public: this.__public.exportKey('pkcs1-public'),
        }
    }
}
