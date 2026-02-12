<template>
    <van-dialog
        v-model:show="props.modelValue"
        @confirm="handleConfirm"
    >
        <van-field
            class="pass-nickname"
            v-model="nickname"
            label="昵称"
            placeholder="在这写你的ID(请不要留空)"
        />
        <van-field
            class="pass-nickname"
            v-model="passkey"
            label="授权码"
            placeholder="请输入授权码(选填)"
            type="password"
        >
            <template #button>
                <van-button
                    size="small"
                    type="primary"
                    @click="handlePastePassKey"
                >
                    粘贴
                </van-button>
            </template>
        </van-field>
    </van-dialog>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { showToast } from 'vant';
import { getCookie, setCookie } from '../common/cookies';

const empty_regex = new RegExp(/^\s*$/)

const props = defineProps(['modelValue'])
const emit = defineEmits(['update:modelValue'])

const nickname = ref<string>('')
const passkey = ref<string>('')

const handleConfirm = () => {
    if (nickname.value.length == 0 || nickname.value.match(empty_regex)) {
        showToast({
            icon: 'close',
            type: 'fail',
            zIndex: '3002',
            message: '昵称不能为空',
            closeOnClick: true
        })
    } else {
        setCookie('name', encodeURI(nickname.value), 7)
        setCookie('key', passkey.value, 7)

        emit('update:modelValue', false)
    }
}

const handlePastePassKey = async () => {
    try {
        const text = await navigator.clipboard.readText()
        passkey.value = text
    } catch {
        showToast({
            icon: 'close',
            type: 'fail',
            zIndex: '3002',
            message: '获取剪贴板失败',
            closeOnClick: true
        })
    }
}

onMounted(() => {
    passkey.value = new URL(window.location.href).searchParams.get('pass') || getCookie('key') || ""
    setCookie('key', passkey.value, 7)

    nickname.value = decodeURI(getCookie('name') || "")
    if (nickname.value.match(empty_regex)) emit('update:modelValue', true)
})

</script>

<style>

.pass-nickname {
  margin: 1rem 1rem;
}

</style>
