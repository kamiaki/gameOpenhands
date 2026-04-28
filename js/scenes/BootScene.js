class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    create() {
        const { width, height } = this.cameras.main;

        this.add.text(width / 2, height / 2, '加载中...', {
            fontSize: '32px',
            color: '#ffffff'
        }).setOrigin(0.5);

        // 模拟加载，然后进入游戏场景
        this.time.delayedCall(500, () => {
            this.scene.start('GameScene');
        });
    }
}
