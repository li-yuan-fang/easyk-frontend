<template>
    <div class="tabbar-container">
        <div class="tabbar-central-container">
            <van-button type="primary" class="tabbar-central" @click="$emit('book')">
                <van-icon class="tabbar-centrl-icon" name="records-o" />
                <text class="tabbar-centrl-text">点歌</text>
            </van-button>
        </div>
        <van-tabbar class="tabbar-back" :model-value="modelValue" @update:model-value="(e) => $emit('update:modelValue', e)">
            <van-tabbar-item class="tabbar-back-item" icon="orders-o">已点</van-tabbar-item>
            <van-tabbar-item style="pointer-events: none;" />
            <van-tabbar-item class="tabbar-back-item" icon="completed-o">已唱</van-tabbar-item>
        </van-tabbar>
    </div>
</template>

<script setup lang="ts">
defineProps(['modelValue'])
defineEmits(['update:modelValue', 'book'])
</script>

<style>

.tabbar-central-container {
    position: fixed;
    left: 50%;
    bottom: 0.2rem;
    transform: translateX(-50%);

    width: 5rem;
    height: 5rem;
    border: 0.1rem solid;
    border-radius: 50%;
    border-color: #fcfcfc;
    box-shadow: 0 0 0 0.1rem #e5e5e5;

    display: flex;

    z-index: 101;
}

.tabbar-central {
    height: auto;
    flex: 1;

    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;

    color: rgba(255, 255, 255, 0.9);
    background: linear-gradient(125deg, #00BEFF, #A27BFF 50%, #199dfa);
    background-size: 600%;
    border-style: none;
    border-radius: 50%;
    animation: anime 10s linear infinite;
}

.tabbar-central > div > span {
    display: flex;
    flex-direction: column;
}

.tabbar-centrl-icon {
    font-size: 1.5rem;
}

.tabbar-centrl-text {
    font-size: 1rem;
    margin-top: 0.3rem;
}

@keyframes anime {
  0% {
    background-position: 0% 50%;
  }

  50% {
    background-position: 100% 50%;
  }

  100% {
    background-position: 0% 50%;
  }
}

.tabbar-back {
    z-index: 100;
    --van-tabbar-height: 4rem;
}

.tabbar-back-item {
    font-size: 1rem;
}

</style>
