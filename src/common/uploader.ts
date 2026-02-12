import { sha256 } from "js-sha256";
import { Mutex } from 'async-mutex';
import { upload_apply, upload_block, upload_quiry } from "./easyk_api";

export {
    getBase64Bytes,
    uploadVideo
}

export type {
    UploadQuiry,
    UploadSession
}

interface UploadQuiry {
    busy: boolean;
    id?: string;
    complete?: boolean;
    hash?: string;
    require?: Array<number>;
}

interface UploadSession {
    id: string;
    chunk?: number;
}

const base64_prefix = 'base64,'
const default_chunk_size = 1 * 1024 * 1024
const working_thread = 4

const getBase64Bytes = (content : string) : Uint8Array => {
    let i = content.indexOf(base64_prefix) + base64_prefix.length
    let data = atob(content.slice(i))
    let arr = new Uint8Array(data.length)
    for (let j = 0; j < data.length; j++) {
        arr[j] = data.charCodeAt(j)
    }

    return arr
}

const uploadVideo = (content : string, callback : (progress : number) => (void)) => {
    return new Promise<string>((resolve, reject) => {
        let data = getBase64Bytes(content)
        let content_id : string | undefined

        let chunk_size : number = default_chunk_size

        const process_upload = () => {
            let lock_queue = new Mutex()

            let commit : number = 0
            let lock_commit = new Mutex()

            let working : number = 0
            let lock_working = new Mutex()

            let hash : string | undefined
            let lock_hash = new Mutex()

            let exit_flag = false

            //创建分块表
            let chunks = new Array<number>()
            let total = Math.ceil(data.length / chunk_size)
            for (let i = 0; i < total; i++) {
                chunks.push(i)
            }

            const upload = () => {
                return new Promise<void>((resolve , reject) => {
                    lock_queue.acquire().then((release) => {
                        if (chunks.length == 0) {
                            //处理完成
                            release()

                            reject()
                            return
                        }

                        let index : number = <number> chunks.shift()
                        release()

                        let buf = data.slice(index * chunk_size, Math.min((index + 1) *chunk_size, data.length))
                        let buf_str = btoa(Array.from(buf, byte => String.fromCharCode(byte)).join(''))

                        const upload_working_decrease = (proc : (() => void)) => {
                            lock_working.acquire().then((release) => {
                                working--
                                release()

                                proc()
                            })
                        }

                        const upload_working_resolve = (success : boolean) => {
                            //console.log(`分块 ${index} 上传成功`)
                            lock_commit.acquire().then((release) => {
                                callback(++commit / total)
                                release()

                                upload_working_decrease(success ? reject : resolve)
                            })
                        }

                        const upload_working_reject = (reason : any) => {
                            console.log(`分块 ${index} 上传失败 - ${reason}`)
                                
                            lock_queue.acquire().then((release) => {
                                chunks.push(index)
                                release()
                                
                                upload_working_decrease(resolve)
                            })
                        }

                        lock_working.acquire().then((release) => {
                            working++
                            release()

                            upload_block(index, buf_str, sha256(buf), chunk_size)
                            .then(upload_working_resolve)
                            .catch(upload_working_reject)
                        })
                    })
                })
            }

            const upload_loop = () => {
                upload().then(upload_loop)
                .catch(() => {
                    //传输完成
                    if (exit_flag) return

                    const quiry = (remain : number, hash : string) => {
                        upload_quiry().then((resp) => {
                            if (!resp.busy || resp.id !== content_id) {
                                reject('远端上传错误')
                                return
                            }

                            if (resp.complete) {
                                //检查Hash
                                if (hash === resp.hash) {
                                    //成功
                                    resolve(<string> content_id)
                                } else {
                                    //数据错误
                                    reject('遭遇无法处理的数据错误')
                                }
                            } else {
                                resp.require?.forEach((chunk) => chunks.push(chunk))

                                if (chunks.length > 0) {
                                    lock_working.acquire().then((release) => {
                                        exit_flag = false
                                        release()

                                        dispatchQueue()
                                    })
                                }
                            }
                        }).catch(() => {
                            if (remain > 0) {
                                quiry(remain - 1, hash)
                            } else {
                                reject('查询上传会话失败')
                            }
                        })
                    }

                    lock_queue.acquire().then((release) => {
                        if (exit_flag) {
                            release()
                            return
                        }

                        if (chunks.length > 0) {
                            release()

                            upload_loop()
                            return
                        }
                        
                        release()

                        lock_working.acquire().then((release) => {
                            if (exit_flag) {
                                release()
                                return
                            }

                            //检查是否仍有未完成的请求
                            if (working > 0) {
                                //如果有则让出 并结束自身运行
                                release()
                                return
                            }

                            //清除后续堵塞线程
                            exit_flag = true
                            release()

                            //全部请求完成 开始查询上传结果
                            lock_hash.acquire().then((release) => {
                                quiry(3, <string> hash)
                            })
                        })
                    })
                })
            }

            const dispatchQueue = () => {
                lock_queue.acquire().then((release) => {
                    let workers = Math.min(working_thread, chunks.length, navigator.hardwareConcurrency)
                    release()

                    for (let i = 0; i < workers; i++) {
                        upload_loop()
                    }
                })
            }

            dispatchQueue()
            lock_hash.acquire().then((release) => {
                hash = sha256(data)
                release()
            })
        }

        upload_apply(data.length)
        .then((resp) => {
            content_id = resp.id
            if (resp.chunk) chunk_size = resp.chunk

            process_upload()
        }).catch(() => reject('创建上传会话失败'))
    })
}
