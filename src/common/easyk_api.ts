import axios, { AxiosError } from "axios"
import type { BookList, BookListItem } from "./book_interfaces"
import { type UploadQuiry, type UploadSession } from "./uploader"

const host : string = '/api'

export {
    queryCurrent,
    queryBookList,
    book,
    removeBook,
    topBook,
    queryOutdatedList,
    reorderBook,
    push,
    pause,
    upload_apply,
    upload_quiry,
    upload_block,
    updateVolume,
    VolumeAction,
    getPanel,
    updatePanel,
    PanelAction
}

enum PanelAction {
    Volume = 'volume',
    Accompaniment = 'accompaniment',

    Kana = 'kana',
    Translated = 'translated',
    Roma = 'roma',

    Offset = 'offset'
}

enum VolumeAction {
    Mute = 0,
    Up,
    Down
}

const queryCurrent = () => {
    return new Promise<BookListItem>((resolve, reject) => {
        axios.get(`${host}/current`, {
            timeout: 5000
        }).then((resp) => {
            if (resp.status !== 200) {
                reject(`请求数据失败 - ${resp.status}`)
                return
            }
            resolve(<BookListItem> resp.data['current'])
        }).catch(() => reject('请求数据失败'))
    })
}

const queryBookList = () => {
    return new Promise<BookList>((resolve, reject) => {
        axios.get(`${host}/list`, {
            timeout: 5000
        }).then((resp) => {
            if (resp.status !== 200) {
                reject(`请求数据失败 - ${resp.status}`)
                return
            }
            resolve(<BookList> resp.data)
        }).catch(() => reject('请求数据失败'))
    })
}

const book = (title : string, type : number, content : string) => {
    return new Promise<string>((resolve, reject) => {
        axios.post(`${host}/book`, {
            title,
            type,
            content
        }, {
            timeout: 5000
        }).then((resp) => {
            if (resp.status !== 200) {
                reject(`请求失败 - ${resp.status}`)
                return
            }

            if (resp.data['success'] == true) {
                resolve(resp.data['id'])
            } else {
                reject('未知错误')
            }
        }).catch(() => reject('无法连接到服务器'))
    })
}

const topBook = (id : string) => {
    return new Promise<void>((resolve, reject) => {
        axios.post(`${host}/top`, {
            id
        }, {
            timeout: 5000
        }).then((resp) => {
            if (resp.status !== 200) {
                reject(`请求失败 - ${resp.status}`)
                return
            }

            if (resp.data['success'] == true) {
                resolve()
            } else {
                reject('未知错误')
            }
        }).catch(() => reject('无法连接到服务器'))
    })
}

const removeBook = (id : string) => {
    return new Promise<void>((resolve, reject) => {
        axios.post(`${host}/remove`, {
            id
        }, {
            timeout: 5000
        }).then((resp) => {
            if (resp.status !== 200) {
                reject(`请求失败 - ${resp.status}`)
                return
            }

            if (resp.data['success'] == true) {
                resolve()
            } else {
                reject('未知错误')
            }
        }).catch(() => reject('无法连接到服务器'))
    })
}

const queryOutdatedList = () => {
    return new Promise<BookList>((resolve, reject) => {
        axios.get(`${host}/outdated`, {
            timeout: 5000
        }).then((resp) => {
            if (resp.status !== 200) {
                reject(`请求数据失败 - ${resp.status}`)
                return
            }
            resolve(<BookList> resp.data)
        }).catch(() => reject('请求数据失败'))
    })
}

const reorderBook = (id : string) => {
    return new Promise<string>((resolve, reject) => {
        axios.post(`${host}/reorder`, {
            id
        }, {
            timeout: 5000
        }).then((resp) => {
            if (resp.status !== 200) {
                reject(`请求失败 - ${resp.status}`)
                return
            }

            if (resp.data['success'] == true) {
                resolve(resp.data['id'])
            } else {
                reject('未知错误')
            }
        }).catch(() => reject('无法连接到服务器'))
    })
}

const push = () => {
    return new Promise<void>((resolve, reject) => {
        axios.get(`${host}/push`, {
            timeout: 5000
        }).then((resp) => {
            if (resp.status !== 200) {
                reject(`请求失败 - ${resp.status}`)
                return
            }

            if (resp.data['success'] == true) {
                resolve()
            } else {
                reject('未知错误')
            }
        }).catch(() => reject('无法连接到服务器'))
    })
}

const pause = () => {
    return new Promise<void>((resolve, reject) => {
        axios.get(`${host}/pause`, {
            timeout: 5000
        }).then((resp) => {
            if (resp.status !== 200) {
                reject(`请求失败 - ${resp.status}`)
                return
            }

            if (resp.data['success'] == true) {
                resolve()
            } else {
                reject('未知错误')
            }
        }).catch(() => reject('无法连接到服务器'))
    })
}

const upload_quiry = () => {
    return new Promise<UploadQuiry>((resolve, reject) => {
        axios.get(`${host}/upload`, {
            timeout: 10000
        }).then((resp) => {
            if (resp.status !== 200) {
                reject(`请求失败 - ${resp.status}`)
                return
            }

            resolve(resp.data)
        }).catch(() => reject('无法连接到服务器'))
    })
}

const upload_apply = (size : number) => {
    return new Promise<UploadSession>((resolve, reject) => {
        axios.post(`${host}/upload`, {
            size
        }, {
            timeout: 5000
        }).then((resp) => {
            resolve(<UploadSession> resp.data)
        }).catch((reason : AxiosError) => {
            if (reason.status == 413) {
                reject('视频文件过大')
            } else {
                reject(reason.response?.statusText || '未知错误')
            }
        })
    })
}

const upload_block = (index : number, data : string, hash : string, maxContentLength : number) => {
    return new Promise<boolean>((resolve, reject) => {
        axios.put(`${host}/upload`, data, {
            headers: {
                'Upload-Index': index,
                'Upload-Hash': hash,
                'Content-Type': 'text/plain'
            },
            timeout: 10000,
            maxContentLength
        }).then((resp) => {
            if (resp.status !== 200) {
                reject(`请求失败 - ${resp.status}`)
                return
            }

            resolve(resp.data['complete'])
        }).catch(() => reject('无法连接到服务器'))
    })
}

const updateVolume = (action : VolumeAction, value : number) => {
    return new Promise<void>((resolve, reject) => {
        axios.post(`${host}/volume`, {
            action,
            value
        }, {
            timeout: 5000
        }).then((resp) => {
            if (resp.status !== 200) {
                reject(`请求失败 - ${resp.status}`)
                return
            }

            if (resp.data['success'] == true) {
                resolve()
            } else {
                reject('未知错误')
            }
        }).catch(() => reject('无法连接到服务器'))
    })
}

const getPanel = () => {
    return new Promise<any>((resolve, reject) => {
        axios.get(`${host}/panel`, {
            timeout: 5000
        }).then((resp) => {
            if (resp.status !== 200) {
                reject(`请求失败 - ${resp.status}`)
                return
            }

            resolve(resp.data)
        }).catch(() => reject('无法连接到服务器'))
    })
}

const updatePanel = (id : PanelAction, value : any) => {
    return new Promise<any>((resolve, reject) => {
        axios.post(`${host}/panel`, {
            id,
            value
        }, {
            timeout: 5000
        }).then((resp) => {
            if (resp.status !== 200) {
                reject(`请求失败 - ${resp.status}`)
                return
            }

            resolve(resp.data)
        }).catch(() => reject('无法连接到服务器'))
    })
}
