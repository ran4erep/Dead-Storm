export interface ConsoleGameBounds {
    screenMaskX: number;
    screenMaskY: number;
    screenMaskW: number;
    screenMaskH: number;
}

export interface ConsoleGameInputDetails {
    isUp: boolean;
    isDown: boolean;
    isLeft: boolean;
    isRight: boolean;
    isAction: boolean;
    isStart: boolean;
    key: string;
    repeat: boolean;
}

export interface ConsoleGame {
    id: string;
    labelKey: string; // Localization key
    getScore: () => number;
    isGameOver: () => boolean;
    hasStarted: () => boolean;
    getTickSpeed: () => number;
    
    init: (playSound: ((soundId: string) => void) | undefined) => void;
    reset: () => void;
    tick: () => void;
    stop: () => void;
    
    draw: (
        screenCtx: CanvasRenderingContext2D,
        bounds: ConsoleGameBounds,
        localAnimFrame: number,
        settings: any,
        strings: any
    ) => void;
    
    handleKeyDown: (details: ConsoleGameInputDetails) => void;
    handleKeyUp: (details: {
        isUp: boolean;
        isDown: boolean;
        isLeft: boolean;
        isRight: boolean;
        isAction: boolean;
    }) => void;
    
    handleContinuousInput?: (pressed: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | null) => void;
    handleSwipe: (dir: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN', isContinuous?: boolean) => void;
    handleTap?: () => void;
}
