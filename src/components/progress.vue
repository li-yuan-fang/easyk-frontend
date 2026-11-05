<template>
    <div v-if="props.modelValue" class="progress-content">
        <text
            class="progress-text"
            style="text-align: left;"
        >
            {{ current_text }}
        </text>
        <van-slider
            class="progress-slider"
            v-model="current"
            bar-height="0.25rem"
            inactive-color="#d0d0d0"
            :min="0"
            :max="1"
            :step="1e-5"
            :disabled="props.disabled"
            @drag-start="handleProgressStart"
            @drag-end="handleProgressCommit"
            @change="handleProgressCommit"
        />
        <text
            class="progress-text"
            style="text-align: right;"
        >
            {{ duration_text }}
        </text>
    </div>
</template>

<script setup lang="ts">
import { formatDuration } from '@/common/time_format';
import { computed, onMounted, ref, watch } from 'vue';
import * as EasyKState from '@/common/easyk_state';
import { seek } from '@/common/easyk_api';
import type { BookListItem } from '@/common/book_interfaces';

const unknown_time : string = '--:--'

const current = ref<number>(0)
const duration = ref<number>(0)

const rate = ref<number>(1.0)

const progress_step = computed(() => (duration.value >= 0) ? (rate.value / duration.value) : 0.0)

const current_text = ref<string>(unknown_time)
const duration_text = ref<string>(unknown_time)

let timer : ReturnType<typeof setInterval> | null = null

watch(duration, () => duration_text.value = formatDuration(duration.value))
watch(current, () => current_text.value = formatDuration(current.value * duration.value))

const props = defineProps(['modelValue', 'disabled'])
const emit = defineEmits(['update:modelValue'])

const handleProgressStart = () => {
    if (timer) {
        clearInterval(timer)
        timer = null
    }
}

const handleProgressCommit = () => {
    seek(current.value).then(() => {
        EasyKState.seek(current.value)

        if (timer) clearInterval(timer)
        timer = setInterval(handleStep, 1000)
    })
}

const handleStep = () => current.value += progress_step.value

const closeProgress = () => {
    if (timer) {
        clearInterval(timer)
        timer = null
    }

    emit('update:modelValue', false)
    rate.value = 1.0
    current_text.value = unknown_time
    duration_text.value = unknown_time
}

const onPlayerPush = (media : BookListItem | null) => {
    if (!media) closeProgress()
}

const handleStateUpdate = (state : EasyKState.PlayState) => {
    switch (state) {
        case EasyKState.PlayState.Stopped:
        case EasyKState.PlayState.Paused:
            if (timer) {
                clearInterval(timer)
                timer = null
            }

            break;
        case EasyKState.PlayState.Playing:
            if (timer) clearInterval(timer)
            timer = setInterval(handleStep, 1000)

            break;
    }
}

const onPlayerPlaying = (state : Pick<EasyKState.PlayerState, 'state' | 'current' | 'rate'>) => {
    current.value = state.current
    rate.value = state.rate

    handleStateUpdate(state.state)
}

const onPlayerLoaded = (state : EasyKState.PlayerState) => {
    duration.value = state.duration
    current.value = state.current
    rate.value = state.rate

    if (timer) clearInterval(timer)
    timer = setInterval(handleStep, 1000)
}

//恢复到准确的状态
const recoverProgress = () : boolean => {
    let snapshot = EasyKState.getSnapshot()
    console.log(snapshot)
    if (!snapshot || !snapshot.media || snapshot.player.state == EasyKState.PlayState.Stopped) {
        console.log('invalid close')
        closeProgress()
        return false
    }

    let player = snapshot.player
    duration.value = player.duration
    current.value = player.current
    rate.value = player.rate
    
    handleStateUpdate(snapshot.player.state)

    return true
}

onMounted(() => {
    console.log('mounted')
    if (!recoverProgress()) return

    EasyKState.usePush(onPlayerPush)
    EasyKState.useLoaded(onPlayerLoaded)
    EasyKState.usePlaying(onPlayerPlaying)
})

</script>

<style scoped>
.progress-content {
    display: flex;
    flex-direction: row;
    justify-content: end;
    align-items: center;

    flex: 1;
    margin: 0 2rem;
}

.progress-slider {
    margin: 0 1.5rem;
}

.progress-text {
    display: inline-block;
    white-space: nowrap;
    box-sizing: border-box;
}

</style>