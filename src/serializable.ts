import { classToPlain } from 'class-transformer'

export class Serializable {
    public serialize(): object {
        return classToPlain(this)
    }

    public stringify(): string {
        return JSON.stringify(this.serialize())
    }
}
