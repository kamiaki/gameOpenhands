// 常量
const TILE_SIZE = 40;
const MAP_COLS = 20;
const MAP_ROWS = 15;
const ROOM_MIN = 3;
const ROOM_MAX = 7;
const MAX_ROOMS = 8;

class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
    }

    create() {
        const { width, height } = this.cameras.main;

        // —— 纹理生成 ——
        this._makeTexture('player_tex', 0x00ff88, TILE_SIZE - 4);
        this._makeTexture('gun_tex', 0x66ffcc, 12, 6);
        this._makeTexture('enemy_tex', 0xff4444, TILE_SIZE - 4);
        this._makeTexture('bullet_tex', 0xffff44, 8);
        this._makeTexture('wall_tex', 0x3a3a5c, TILE_SIZE);
        this._makeTexture('floor_tex', 0x1a1a2e, TILE_SIZE);

        // —— 状态 ——
        this.hp = 5;
        this.shootCooldown = 0;
        this.lastDirX = 0;
        this.lastDirY = 0;
        this.debugText = this.add.text(width / 2, 50, '', {
            fontSize: '16px', color: '#ffff00', fontFamily: 'monospace'
        }).setOrigin(0.5, 0).setDepth(99);

        // —— HUD ——
        this.hpText = this.add.text(16, 16, '❤️ x ' + this.hp, {
            fontSize: '20px', color: '#ff6666', fontFamily: 'monospace'
        });
        this.floorText = this.add.text(width - 16, 16, '第 1 层', {
            fontSize: '18px', color: '#aaaaaa', fontFamily: 'monospace'
        }).setOrigin(1, 0);

        // —— 地图 ——
        this.floorNumber = 1;
        this.mapData = []; // 0=floor, 1=wall
        this.wallGroup = this.physics.add.staticGroup();
        this.floorImages = this.add.group();
        this._generateDungeon();

        // —— 玩家 ——
        this.player = this.physics.add.sprite(this.startX, this.startY, 'player_tex');
        this.player.setCollideWorldBounds(true);
        this.player.body.setAllowGravity(false);
        this.player.setDepth(10);

        // —— 枪（标识朝向，从身体伸出） ——
        this.gun = this.add.sprite(this.startX + 22, this.startY, 'gun_tex');
        this.gun.setDepth(11);
        this.gun.setOrigin(0.5);

        // —— 子弹 ——
        this.bullets = this.physics.add.group();

        // —— 敌人 ——
        this.enemies = this.physics.add.group();
        this._spawnEnemies();

        // —— 碰撞 ——
        this.physics.add.collider(this.player, this.wallGroup);
        this.physics.add.collider(this.enemies, this.wallGroup);
        this.physics.add.collider(this.bullets, this.wallGroup, this._hitWall, null, this);
        this.physics.add.overlap(this.bullets, this.enemies, this._bulletHitEnemy, null, this);
        this.physics.add.overlap(this.player, this.enemies, this._hitEnemy, null, this);

        // —— 输入 ——
        this.keys = {
            W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
            UP: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
            DOWN: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
            LEFT: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
            RIGHT: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
            J: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.J),
            SPACE: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
        };

        // 提示
        this.add.text(width / 2, height - 20, 'WASD/方向键移动 · J/空格射击', {
            fontSize: '13px', color: '#666688', fontFamily: 'monospace'
        }).setOrigin(0.5);
    }

    // ======= 纹理生成 =======
    _makeTexture(key, color, w, h) {
        h = h || w;
        const g = this.add.graphics();
        g.fillStyle(color, 1);
        g.fillRect(0, 0, w, h);
        g.generateTexture(key, w, h);
        g.destroy();
    }

    // ======= 地牢生成 =======
    _generateDungeon() {
        this.mapData = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill(1));

        // 房间
        this.rooms = [];
        for (let i = 0; i < MAX_ROOMS * 3; i++) {
            if (this.rooms.length >= MAX_ROOMS) break;
            const rw = Phaser.Math.Between(ROOM_MIN, ROOM_MAX);
            const rh = Phaser.Math.Between(ROOM_MIN, ROOM_MAX);
            const rx = Phaser.Math.Between(1, MAP_COLS - rw - 1);
            const ry = Phaser.Math.Between(1, MAP_ROWS - rh - 1);
            const room = { x: rx, y: ry, w: rw, h: rh, cx: Math.floor(rx + rw / 2), cy: Math.floor(ry + rh / 2) };

            if (!this._roomOverlaps(room)) {
                this.rooms.push(room);
                for (let y = room.y; y < room.y + room.h; y++) {
                    for (let x = room.x; x < room.x + room.w; x++) {
                        this.mapData[y][x] = 0;
                    }
                }
            }
        }

        // 连接房间的走廊
        for (let i = 1; i < this.rooms.length; i++) {
            const a = this.rooms[i - 1];
            const b = this.rooms[i];
            // 水平 + 垂直 L 形走廊
            for (let x = Math.min(a.cx, b.cx); x <= Math.max(a.cx, b.cx); x++) {
                this.mapData[a.cy][x] = 0;
            }
            for (let y = Math.min(a.cy, b.cy); y <= Math.max(a.cy, b.cy); y++) {
                this.mapData[y][b.cx] = 0;
            }
        }

        // 放置瓷砖
        this.wallGroup.clear(true, true);
        this.floorImages.clear(true, true);
        for (let y = 0; y < MAP_ROWS; y++) {
            for (let x = 0; x < MAP_COLS; x++) {
                const px = x * TILE_SIZE + TILE_SIZE / 2;
                const py = y * TILE_SIZE + TILE_SIZE / 2;
                if (this.mapData[y][x] === 1) {
                    const wall = this.wallGroup.create(px, py, 'wall_tex');
                    wall.setDisplaySize(TILE_SIZE, TILE_SIZE);
                    wall.refreshBody();
                } else {
                    this.floorImages.add(this.add.image(px, py, 'floor_tex'));
                }
            }
        }

        // 玩家起点 = 第一个房间中心
        const r0 = this.rooms[0];
        this.startX = r0.cx * TILE_SIZE + TILE_SIZE / 2;
        this.startY = r0.cy * TILE_SIZE + TILE_SIZE / 2;
    }

    _roomOverlaps(room) {
        for (const r of this.rooms) {
            if (r.x - 1 < room.x + room.w && r.x + r.w + 1 > room.x &&
                r.y - 1 < room.y + room.h && r.y + r.h + 1 > room.y) {
                return true;
            }
        }
        return false;
    }

    _randomFloorTile() {
        for (let tries = 0; tries < 200; tries++) {
            const x = Phaser.Math.Between(1, MAP_COLS - 2);
            const y = Phaser.Math.Between(1, MAP_ROWS - 2);
            if (this.mapData[y][x] === 0) return { x: x * TILE_SIZE + TILE_SIZE / 2, y: y * TILE_SIZE + TILE_SIZE / 2 };
        }
        return { x: this.startX, y: this.startY };
    }

    // ======= 敌人 =======
    _spawnEnemies() {
        const count = 3 + this.floorNumber;
        for (let i = 0; i < count; i++) {
            const pos = this._randomFloorTile();
            const enemy = this.enemies.create(pos.x, pos.y, 'enemy_tex');
            enemy.setDepth(5);
            enemy.body.setAllowGravity(false);
            enemy.hp = 2;
            enemy.speed = 50 + Math.random() * 30;
            enemy.setCollideWorldBounds(true);
        }
    }

    // ======= 子弹 =======
    _shootBullet() {
        if (this.shootCooldown > 0) return;
        this.shootCooldown = 250;

        let bx = this.player.x, by = this.player.y;
        let vx = 0, vy = 0;
        if (this.lastDirX !== 0) {
            bx += this.lastDirX * 26;
            by = this.player.y;
            vx = this.lastDirX * 400;
        } else if (this.lastDirY < 0) {
            bx = this.player.x;
            by = this.player.y - 26;
            vy = -400;
        } else if (this.lastDirY > 0) {
            bx = this.player.x;
            by = this.player.y + 26;
            vy = 400;
        }

        const bullet = this.bullets.create(bx, by, 'bullet_tex');
        bullet.setDepth(8);
        bullet.body.setAllowGravity(false);
        bullet.setVelocity(vx, vy);
        bullet.setCollideWorldBounds(true);
        // 出界自动销毁
        this.time.delayedCall(2000, () => { if (bullet.active) bullet.destroy(); });
    }

    _hitWall(bullet) {
        if (bullet.active) bullet.destroy();
    }

    _bulletHitEnemy(bullet, enemy) {
        if (!bullet.active || !enemy.active) return;
        bullet.destroy();

        enemy.hp -= 1;
        // 击退
        const angle = Phaser.Math.Angle.Between(bullet.x, bullet.y, enemy.x, enemy.y);
        enemy.setVelocity(Math.cos(angle) * 150, Math.sin(angle) * 150);
        this.time.delayedCall(100, () => { if (enemy.active) enemy.setVelocity(0, 0); });

        if (enemy.hp <= 0) {
            enemy.destroy();
        }
    }

    // ======= 碰撞伤害(被敌人碰到) =======
    _hitEnemy(player, enemy) {
        if (!enemy.active) return;
        this.hp -= 1;
        this.hpText.setText('❤️ x ' + this.hp);
        player.setTint(0xff0000);
        this.time.delayedCall(150, () => { if (player.active) player.setTint(0xffffff); });
        // 击退玩家
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, player.x, player.y);
        player.setVelocity(Math.cos(angle) * 250, Math.sin(angle) * 250);

        if (this.hp <= 0) {
            this._gameOver();
        }
    }

    _gameOver() {
        this.scene.start('BootScene');
    }

    // ======= 下一层 =======
    _nextFloor() {
        this.floorNumber++;
        this.floorText.setText('第 ' + this.floorNumber + ' 层');
        // 清空并重生整个地牢
        this.bullets.clear(true, true);
        this.enemies.clear(true, true);
        this._generateDungeon();
        this.player.setPosition(this.startX, this.startY);
        this.gun.setPosition(this.startX + 14, this.startY);
        this._spawnEnemies();
    }

    // ======= 更新循环 =======
    update(time, delta) {
        if (this.shootCooldown > 0) this.shootCooldown -= delta;

        // 玩家移动（俯视角 WASD / 方向键）
        const speed = 160;
        let vx = 0, vy = 0;
        if (this.keys.A.isDown || this.keys.LEFT.isDown) vx = -speed;
        else if (this.keys.D.isDown || this.keys.RIGHT.isDown) vx = speed;
        if (this.keys.W.isDown || this.keys.UP.isDown) vy = -speed;
        else if (this.keys.S.isDown || this.keys.DOWN.isDown) vy = speed;
        // 归一化斜向移动
        if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }

        // 记录朝向（清零无输入的方向）
        this.lastDirX = vx > 0 ? 1 : (vx < 0 ? -1 : 0);
        this.lastDirY = vy > 0 ? 1 : (vy < 0 ? -1 : 0);

        this.player.setVelocity(vx, vy);

        this.debugText.setText('dirX=' + this.lastDirX + ' dirY=' + this.lastDirY + ' vy=' + vy);

        // 枪跟着玩家，朝四个方向旋转
        const gunOff = 22;
        let gx = this.player.x, gy = this.player.y, angle = 0;
        if (this.lastDirX > 0) {
            gx += gunOff; angle = 0;
        } else if (this.lastDirX < 0) {
            gx -= gunOff; angle = 180;
        } else if (this.lastDirY < 0) {
            gy -= gunOff; angle = -90;
        } else if (this.lastDirY > 0) {
            gy += gunOff; angle = 90;
        }
        this.gun.setPosition(gx, gy);
        this.gun.setAngle(angle);

        // 射击
        if (this.keys.J.isDown || this.keys.SPACE.isDown) {
            this._shootBullet();
        }

        // 敌人 AI：朝向玩家移动
        this.enemies.getChildren().forEach(enemy => {
            if (!enemy.active) return;
            const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
            enemy.setVelocity(
                Math.cos(angle) * enemy.speed,
                Math.sin(angle) * enemy.speed
            );
        });

        // 检查是否所有敌人被清空 -> 下楼
        if (this.enemies.countActive() === 0) {
            this._nextFloor();
        }
    }
}
