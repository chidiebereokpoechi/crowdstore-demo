import axios from 'axios'
import { plainToClass } from 'class-transformer'
import * as fs from 'fs'
import * as ip from 'ip'
import * as request from 'request'
import { Block } from './block'
import { TRACKER_LOCATION } from './constants'
import { Node } from './node'

const getUrl = (address: string, endpoint: string): string => {
    const HTTP_PREFIX = 'http://'
    return HTTP_PREFIX + address + '/' + endpoint
}

export class Requester {
    public static async announceNode(nodeId: string, port: string | number) {
        const address = `${ip.address('Wi-Fi')}:${port}`
        const { data } = (
            await axios.post(getUrl(TRACKER_LOCATION, 'announce'), {
                id: nodeId,
                address,
            })
        ).data

        const peers = data as { id: string; address: string }[]
        return peers
    }

    public static async getPeers(from: string) {
        const { data } = (await axios.get(getUrl(from, 'peers'))).data
        const peers = data as Node['peers']
        return peers
    }

    public static async getBlocks(from: string) {
        const {
            data: { chain },
        } = (await axios.get(getUrl(from, 'blocks'))).data
        const blocks = plainToClass(Block, chain as Block[])
        return blocks
    }

    public static async pingPeers(peers: Node['peers'], node: Node) {
        Object.keys(peers).forEach(async (id) => {
            axios
                .get(getUrl(peers[id], 'ping'))
                .then((response) => {
                    if (response.data.message !== 'PING!') node.removePeer(id)
                })
                .catch(() => node.removePeer(id))
        })
    }

    public static async broadcastPeer(
        to: string,
        peer: { id: string; address: string }
    ) {
        return axios.post(getUrl(to, 'peers'), peer)
    }

    public static async broadcastBlock(to: string, block: Block) {
        return axios.post(getUrl(to, 'blocks'), block)
    }

    public static async downloadFile(
        from: string,
        fileHash: string,
        writeStream: fs.WriteStream
    ): Promise<void> {
        return new Promise((resolve) => {
            request({ uri: getUrl(from, 'file/' + fileHash) })
                .pipe(writeStream)
                .on('finish', async () => {
                    resolve()
                })
        })
    }

    public static async uploadFile(
        to: string,
        stream: fs.ReadStream,
        name: string
    ) {
        const options = {
            method: 'POST',
            url: getUrl(to, 'file'),
            headers: {
                'Content-Type':
                    'multipart/form-data; boundary=---011000010111000001101001',
            },
            formData: {
                chunk: {
                    value: stream,
                    options: {
                        filename: name,
                        contentType: null,
                    },
                },
            },
        }

        return new Promise((resolve, reject) => {
            request(options, (error, response, body) => {
                if (error) {
                    console.log(response)
                    return reject(error)
                }

                resolve(body)
            })
        })
    }
}
