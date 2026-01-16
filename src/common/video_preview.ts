export {
    renderPreview
}

const renderPreview = (url : string, position : number = 0.5) => {
    return new Promise<string>((resolve) => {
        let state : number = 0
        let tempVideo = document.createElement('video')
        tempVideo.src = url
        tempVideo.crossOrigin = 'anonymous'
        tempVideo.muted = true
        tempVideo.currentTime = 0

        tempVideo.addEventListener('canplay', () => {
            switch (state) {
                case 0:
                    tempVideo.currentTime = tempVideo.duration * position
                    state++
                    break
                case 1:
                    {
                        tempVideo.currentTime = tempVideo.duration
                        let canvas = document.createElement('canvas')
                        canvas.width = tempVideo.videoWidth
                        canvas.height = tempVideo.videoHeight
                        let ctx = canvas.getContext('2d')
                        ctx?.drawImage(tempVideo, 0, 0, canvas.width, canvas.height)
                        tempVideo.remove()

                        resolve(canvas.toDataURL('image/png'))

                        canvas.remove()
                    }

                    state++
                    break
            }
        })
    })
}