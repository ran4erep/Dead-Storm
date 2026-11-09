import { ConsoleGame, ConsoleGameBounds, ConsoleGameInputDetails } from './types';

const GRID_SIZE = 15;
const GAME_SPEED = 150;

export class SnakeGame implements ConsoleGame {
    id = 'snake';
    labelKey = 'snake_title';

    private snake: { x: number, y: number }[] = [{ x: 7, y: 7 }];
    private food: { x: number, y: number } = { x: 3, y: 3 };
    private dir: { x: number, y: number } = { x: 1, y: 0 };
    private nextDir: { x: number, y: number } = { x: 1, y: 0 };
    private score = 0;
    private gameOver = true;
    private hasStartedFlag = false;

    private lastProcessedDir: { x: number, y: number } = { x: 1, y: 0 };
    private hasChangedDirThisTick = false;
    private stepsSinceFood = 0;
    private initialDistance = 4;

    private snakeDecayGrid: number[][] = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(0));
    private foodDecayGrid: number[][] = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(0));

    private playSound: ((soundId: string) => void) | undefined;
    private demoInterval: number | null = null;

    init(playSound: ((soundId: string) => void) | undefined) {
        this.playSound = playSound;
        this.startDemoLoop();
    }

    getScore() {
        return this.score;
    }

    isGameOver() {
        return this.gameOver;
    }

    hasStarted() {
        return this.hasStartedFlag;
    }

    getTickSpeed() {
        return GAME_SPEED;
    }

    stop() {
        this.stopDemoLoop();
    }

    private startDemoLoop() {
        this.stopDemoLoop();
        this.demoInterval = window.setInterval(() => {
            if (this.hasStartedFlag || !this.gameOver) return;
            this.runDemoStep();
        }, GAME_SPEED);
    }

    private stopDemoLoop() {
        if (this.demoInterval !== null) {
            clearInterval(this.demoInterval);
            this.demoInterval = null;
        }
    }

    reset() {
        this.stopDemoLoop();
        const startDir = { x: 1, y: 0 };
        let initialFood = { x: Math.floor(Math.random() * GRID_SIZE), y: Math.floor(Math.random() * GRID_SIZE) };
        while (initialFood.x === 7 && initialFood.y === 7) {
            initialFood.x = Math.floor(Math.random() * GRID_SIZE);
            initialFood.y = Math.floor(Math.random() * GRID_SIZE);
        }
        this.snake = [{ x: 7, y: 7 }];
        this.food = initialFood;
        this.dir = startDir;
        this.nextDir = startDir;
        this.lastProcessedDir = startDir;
        this.hasChangedDirThisTick = false;
        this.gameOver = false;
        this.hasStartedFlag = true;
        this.score = 0;
        this.stepsSinceFood = 0;
        this.initialDistance = Math.abs(7 - initialFood.x) + Math.abs(7 - initialFood.y);

        // Clear LCD ghosting decay matrices
        for (let r = 0; r < GRID_SIZE; r++) {
            this.snakeDecayGrid[r].fill(0);
            this.foodDecayGrid[r].fill(0);
        }

        if (this.playSound) {
            this.playSound('CONSOLE_START');
        }
    }

    tick() {
        if (this.gameOver) return;

        const prevSnake = this.snake;
        if (prevSnake.length === 0) return;
        const head = prevSnake[0];
        const actualDir = this.nextDir;
        this.lastProcessedDir = actualDir;
        this.hasChangedDirThisTick = false;
        this.dir = actualDir;

        const newHead = { x: head.x + actualDir.x, y: head.y + actualDir.y };

        // Check if food will be eaten
        const ateFood = (newHead.x === this.food.x && newHead.y === this.food.y);

        // Collisions
        const collisionSegments = ateFood ? prevSnake : prevSnake.slice(0, -1);
        if (
            newHead.x < 0 || newHead.x >= GRID_SIZE || 
            newHead.y < 0 || newHead.y >= GRID_SIZE ||
            collisionSegments.some(segment => segment.x === newHead.x && segment.y === newHead.y)
        ) {
            this.gameOver = true;
            this.startDemoLoop();
            return;
        }

        const newSnake = [newHead, ...prevSnake];
        this.stepsSinceFood += 1;

        if (ateFood) {
            if (this.playSound) {
                this.playSound('CONSOLE_FOOD');
            }
            const steps = this.stepsSinceFood;
            const initDist = this.initialDistance;
            
            const extraSteps = Math.max(0, steps - initDist);
            const points = Math.max(1, 20 - extraSteps);
            
            this.score += points;
            if (this.score >= 200) {
                 window.dispatchEvent(new CustomEvent('achievement-update', { detail: { action: 'unlock', statKey: 'snake_master' } }));
            }
            this.stepsSinceFood = 0;
            
            // Generate new food
            let newFood = { x: Math.floor(Math.random() * GRID_SIZE), y: Math.floor(Math.random() * GRID_SIZE) };
            while (newSnake.some(s => s.x === newFood.x && s.y === newFood.y)) {
                newFood = { x: Math.floor(Math.random() * GRID_SIZE), y: Math.floor(Math.random() * GRID_SIZE) };
            }
            this.food = newFood;
            this.initialDistance = Math.abs(newHead.x - newFood.x) + Math.abs(newHead.y - newFood.y);
        } else {
            newSnake.pop(); 
        }

        this.snake = newSnake;
    }

    private runDemoStep() {
        const prevSnake = this.snake;
        if (prevSnake.length === 0) return;
        const head = prevSnake[0];
        const currentFood = this.food;

        const possibleDirs = [
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: -1 }
        ];

        const safeDirs = possibleDirs.filter(d => {
            const nextX = head.x + d.x;
            const nextY = head.y + d.y;
            if (nextX < 0 || nextX >= GRID_SIZE || nextY < 0 || nextY >= GRID_SIZE) return false;
            if (prevSnake.some(segment => segment.x === nextX && segment.y === nextY)) return false;
            return true;
        });

        let chosenDir = this.dir;
        if (safeDirs.length > 0) {
            const sortedDirs = safeDirs.map(d => {
                const nextX = head.x + d.x;
                const nextY = head.y + d.y;
                const dist = Math.abs(nextX - currentFood.x) + Math.abs(nextY - currentFood.y);
                return { dir: d, dist };
            }).sort((a, b) => a.dist - b.dist);

            chosenDir = sortedDirs[0].dir;
        } else {
            // Relocate snake to keep demo alive
            let initialFood = { x: Math.floor(Math.random() * GRID_SIZE), y: Math.floor(Math.random() * GRID_SIZE) };
            this.snake = [{ x: 7, y: 7 }];
            this.food = initialFood;
            this.dir = { x: 1, y: 0 };
            return;
        }

        this.dir = chosenDir;
        const newHead = { x: head.x + chosenDir.x, y: head.y + chosenDir.y };
        const newSnake = [newHead, ...prevSnake];

        if (newHead.x === currentFood.x && newHead.y === currentFood.y) {
            let newFood = { x: Math.floor(Math.random() * GRID_SIZE), y: Math.floor(Math.random() * GRID_SIZE) };
            while (newSnake.some(s => s.x === newFood.x && s.y === newFood.y)) {
                newFood = { x: Math.floor(Math.random() * GRID_SIZE), y: Math.floor(Math.random() * GRID_SIZE) };
            }
            this.food = newFood;
        } else {
            newSnake.pop();
        }
        this.snake = newSnake;
    }

    draw(
        screenCtx: CanvasRenderingContext2D,
        bounds: ConsoleGameBounds,
        localAnimFrame: number,
        settings: any,
        strings: any
    ) {
        const { screenMaskX, screenMaskY, screenMaskW, screenMaskH } = bounds;

        const gameSize = Math.min(screenMaskH, screenMaskW * 0.75);
        const cellSize = gameSize / GRID_SIZE;
        const gameWidth = gameSize;
        const gameHeight = gameSize;
        
        const offsetX = screenMaskX;
        const offsetY = screenMaskY + (screenMaskH - gameHeight) / 2;

        // Draw Active Playable Area Border
        screenCtx.strokeStyle = 'rgba(15, 56, 15, 0.3)';
        screenCtx.lineWidth = 1;
        screenCtx.strokeRect(offsetX, offsetY, gameWidth, gameHeight);

        // Draw Score Area on the right
        const scoreAreaX = offsetX + gameWidth;
        let scoreAreaW = screenMaskW - gameWidth;
        if (scoreAreaW < 10) {
             scoreAreaW = Math.max(10, screenMaskW * 0.2);
        }

        screenCtx.fillStyle = '#306230';
        screenCtx.textAlign = 'center';
        screenCtx.textBaseline = 'top';
        
        const scoreStr = `${this.score}`;
        const targetChars = Math.max(3, scoreStr.length); 
        const charRatio = 0.6;
        
        let scoreFontSize = Math.floor(scoreAreaW / (targetChars * charRatio));
        scoreFontSize = Math.min(scoreFontSize, Math.max(5, Math.floor(screenMaskH * 0.15)));
        
        screenCtx.font = `bold ${scoreFontSize}px monospace`;
        
        const textCenterX = scoreAreaX + scoreAreaW / 2;
        const textTopY = screenMaskY + (screenMaskH * 0.05);

        screenCtx.fillText(scoreStr, textCenterX, textTopY);

        const cellGap = cellSize * 0.1;
        const getCellBounds = (cx: number, cy: number) => {
            return {
                x: offsetX + cx * cellSize + cellGap / 2,
                y: offsetY + cy * cellSize + cellGap / 2,
                w: cellSize - cellGap,
                h: cellSize - cellGap
            };
        };

        // Render background inactive LCD pixels (grid)
        screenCtx.fillStyle = 'rgba(15, 56, 15, 0.07)';
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const b = getCellBounds(x, y);
                screenCtx.fillRect(b.x, b.y, b.w, b.h);
            }
        }

        // Food blink
        const isFoodVisible = Math.floor(localAnimFrame / 15) % 2 === 0 || !this.hasStartedFlag || this.gameOver;

        // Update Snake and Food Decay Grids
        const snakeCurrentlyOn = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(false));
        this.snake.forEach(segment => {
            if (segment.x >= 0 && segment.x < GRID_SIZE && segment.y >= 0 && segment.y < GRID_SIZE) {
                snakeCurrentlyOn[segment.y][segment.x] = true;
            }
        });

        const foodCurrentlyOn = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(false));
        if (isFoodVisible && this.food.x >= 0 && this.food.x < GRID_SIZE && this.food.y >= 0 && this.food.y < GRID_SIZE) {
            foodCurrentlyOn[this.food.y][this.food.x] = true;
        }

        const isGhosting = settings?.lcdGhosting !== false;
        const snakeDecayRate = isGhosting ? 0.045 : 1.0;
        const foodDecayRate = isGhosting ? 0.06 : 1.0;

        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                if (snakeCurrentlyOn[y][x]) {
                    this.snakeDecayGrid[y][x] = 1.0;
                } else {
                    this.snakeDecayGrid[y][x] = Math.max(0, this.snakeDecayGrid[y][x] - snakeDecayRate);
                }

                if (foodCurrentlyOn[y][x]) {
                    this.foodDecayGrid[y][x] = 1.0;
                } else {
                    this.foodDecayGrid[y][x] = Math.max(0, this.foodDecayGrid[y][x] - foodDecayRate);
                }
            }
        }

        // Render Food & Food trails
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const intensity = this.foodDecayGrid[y][x];
                if (intensity > 0) {
                    const opacity = intensity === 1.0 ? 1.0 : Math.pow(intensity, 1.5) * 0.75;
                    screenCtx.fillStyle = `rgba(48, 98, 48, ${opacity})`;
                    const b = getCellBounds(x, y);
                    screenCtx.fillRect(b.x, b.y, b.w, b.h);
                }
            }
        }

        // Render Snake segments & trails
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const intensity = this.snakeDecayGrid[y][x];
                if (intensity > 0) {
                    const opacity = intensity === 1.0 ? 1.0 : Math.pow(intensity, 1.4) * 0.75;
                    screenCtx.fillStyle = `rgba(15, 56, 15, ${opacity})`;
                    const b = getCellBounds(x, y);
                    screenCtx.fillRect(b.x, b.y, b.w, b.h);
                }
            }
        }

        if (this.gameOver) {
             screenCtx.textAlign = 'center';
             screenCtx.textBaseline = 'middle';
             screenCtx.fillStyle = '#306230';

             if (!this.hasStartedFlag) {
                 // Start Screen
                 const titleText = strings?.ui?.console?.snake_title || "SNAKE";
                 const fontSizeTitle = Math.max(5, Math.min(10, Math.floor((gameWidth - 4) / (titleText.length * 0.6))));
                 
                 const textSub = strings?.ui?.console?.press_start || "PRESS START";
                 const fontSizeSub = Math.max(4, Math.min(6, Math.floor((gameWidth - 4) / (textSub.length * 0.6))));

                 const centerY = offsetY + gameHeight / 2 - 4;
                 screenCtx.font = `bold ${fontSizeTitle}px monospace`;
                 const totalWidth = screenCtx.measureText(titleText).width;
                 const textStartX = offsetX + (gameWidth - totalWidth) / 2;
                 
                 let currentX = textStartX;
                 for (let i = 0; i < titleText.length; i++) {
                      const char = titleText[i];
                      const charWidth = screenCtx.measureText(char).width;
                      const bounceY = Math.sin((localAnimFrame * 0.15) - (i * 0.4)) * 2;
                      screenCtx.fillText(char, currentX + charWidth / 2, centerY + bounceY);
                      currentX += charWidth;
                 }

                 if (Math.floor(localAnimFrame / 15) % 2 === 0) {
                     screenCtx.font = `${fontSizeSub}px monospace`;
                     screenCtx.textAlign = 'left';
                     screenCtx.fillText(textSub, offsetX + 1, offsetY + gameHeight / 2 + 8);
                     screenCtx.textAlign = 'center';
                 }
             } else {
                 // Game Over Screen
                 const textTitle = strings?.ui?.console?.game_over || "GAME OVER";
                 const fontSizeTitle = Math.max(5, Math.min(10, Math.floor((gameWidth - 4) / (textTitle.length * 0.6))));
                 
                 const textSub = strings?.ui?.console?.press_start || "PRESS START";
                 const fontSizeSub = Math.max(4, Math.min(6, Math.floor((gameWidth - 4) / (textSub.length * 0.6))));

                 screenCtx.font = `bold ${fontSizeTitle}px monospace`;
                 const vibrationY = Math.sin(localAnimFrame * 0.25) * 1.0;
                 screenCtx.fillText(textTitle, offsetX + gameWidth / 2, offsetY + gameHeight / 2 - 4 + vibrationY, gameWidth - 6);
                 
                 if (Math.floor(localAnimFrame / 15) % 2 === 0) {
                     screenCtx.font = `${fontSizeSub}px monospace`;
                     screenCtx.textAlign = 'left';
                     screenCtx.fillText(textSub, offsetX + 1, offsetY + gameHeight / 2 + 8, gameWidth - 2);
                     screenCtx.textAlign = 'center';
                 }
             }
        }
    }

    handleKeyDown(details: ConsoleGameInputDetails) {
        if (this.gameOver) return;

        if (!this.hasChangedDirThisTick) {
            if (details.isUp && this.lastProcessedDir.y === 0) {
                this.hasChangedDirThisTick = true;
                this.nextDir = { x: 0, y: -1 };
            } else if (details.isDown && this.lastProcessedDir.y === 0) {
                this.hasChangedDirThisTick = true;
                this.nextDir = { x: 0, y: 1 };
            } else if (details.isLeft && this.lastProcessedDir.x === 0) {
                this.hasChangedDirThisTick = true;
                this.nextDir = { x: -1, y: 0 };
            } else if (details.isRight && this.lastProcessedDir.x === 0) {
                this.hasChangedDirThisTick = true;
                this.nextDir = { x: 1, y: 0 };
            }
        }
    }

    handleKeyUp() {}

    handleSwipe(dir: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN') {
        if (this.gameOver) return;

        if (!this.hasChangedDirThisTick) {
            if (dir === 'UP' && this.lastProcessedDir.y === 0) {
                this.hasChangedDirThisTick = true;
                this.nextDir = { x: 0, y: -1 };
            } else if (dir === 'DOWN' && this.lastProcessedDir.y === 0) {
                this.hasChangedDirThisTick = true;
                this.nextDir = { x: 0, y: 1 };
            } else if (dir === 'LEFT' && this.lastProcessedDir.x === 0) {
                this.hasChangedDirThisTick = true;
                this.nextDir = { x: -1, y: 0 };
            } else if (dir === 'RIGHT' && this.lastProcessedDir.x === 0) {
                this.hasChangedDirThisTick = true;
                this.nextDir = { x: 1, y: 0 };
            }
        }
    }
}
