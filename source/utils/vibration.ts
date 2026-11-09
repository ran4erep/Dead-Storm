/**
 * Модуль единого управления вибрацией (вибрация телефона и геймпад).
 * Разработан с учетом высокой производительности и предотвращения утечек/накладывания таймеров.
 */

let activeTimeoutIds: number[] = [];

/**
 * Останавливает текущее вибрирование всех геймпадов.
 */
export function stopGamepadVibration(): void {
  // Очищаем все запланированные шаги паттернов
  activeTimeoutIds.forEach(id => clearTimeout(id));
  activeTimeoutIds = [];

  const gamepads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  for (let i = 0; i < gamepads.length; i++) {
    const gp = gamepads[i] as any;
    if (!gp) continue;
    
    // Остановка вибрации через vibrationPlayEffect
    if (gp.vibrationPlayEffect && typeof gp.vibrationPlayEffect.playEffect === 'function') {
      try {
        gp.vibrationPlayEffect.playEffect('dual-rumble', {
          startDelay: 0,
          duration: 0,
          strongMagnitude: 0,
          weakMagnitude: 0
        }).catch(() => {});
      } catch (err) {}
    } 
    // Остановка вибрации через hapticActuators
    else if (gp.hapticActuators) {
      for (let j = 0; j < gp.hapticActuators.length; j++) {
        const actuator = gp.hapticActuators[j];
        if (actuator && typeof actuator.playEffect === 'function') {
          try {
            actuator.playEffect('dual-rumble', {
              startDelay: 0,
              duration: 0,
              strongMagnitude: 0,
              weakMagnitude: 0
            }).catch(() => {});
          } catch (err) {}
        }
      }
    }
  }
}

/**
 * Запускает вибрацию на всех подключенных геймпадах.
 * @param pattern Длительность вибрации в мс или массив шаблона вибрации [вибрация, пауза, вибрация, пауза...]
 */
export function vibrateGamepad(pattern: number | number[]): void {
  // Останавливаем предыдущую активную вибрацию
  stopGamepadVibration();

  const gamepads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  
  const triggerSingleVibe = (gp: any, duration: number) => {
    if (gp.vibrationPlayEffect && typeof gp.vibrationPlayEffect.playEffect === 'function') {
      try {
        gp.vibrationPlayEffect.playEffect('dual-rumble', {
          startDelay: 0,
          duration: duration,
          strongMagnitude: 0.8,
          weakMagnitude: 0.8
        }).catch(() => {});
      } catch (err) {}
    } else if (gp.hapticActuators) {
      for (let j = 0; j < gp.hapticActuators.length; j++) {
        const actuator = gp.hapticActuators[j];
        if (actuator && typeof actuator.playEffect === 'function') {
          try {
            actuator.playEffect('dual-rumble', {
              startDelay: 0,
              duration: duration,
              strongMagnitude: 0.8,
              weakMagnitude: 0.8
            }).catch(() => {});
          } catch (err) {}
        }
      }
    }
  };

  for (let i = 0; i < gamepads.length; i++) {
    const gp = gamepads[i] as any;
    if (!gp) continue;

    // Проверяем поддержку вибрации на конкретном геймпаде
    const supportsVibe = !!gp.vibrationPlayEffect || (gp.hapticActuators && gp.hapticActuators.length > 0);
    if (!supportsVibe) continue;

    if (typeof pattern === 'number') {
      triggerSingleVibe(gp, pattern);
    } else if (Array.isArray(pattern)) {
      let delay = 0;
      for (let j = 0; j < pattern.length; j++) {
        const duration = pattern[j];
        if (j % 2 === 0) {
          // Четный индекс — это фаза вибрации
          const currentDelay = delay;
          const gamepadIndex = gp.index;
          
          const timeoutId = window.setTimeout(() => {
            const freshGps = navigator.getGamepads();
            const freshGp = freshGps[gamepadIndex];
            if (freshGp) {
              triggerSingleVibe(freshGp, duration);
            }
          }, currentDelay);
          
          activeTimeoutIds.push(timeoutId);
        }
        delay += duration;
      }
    }
  }
}

/**
 * Единая точка вызова вибрации для телефона и геймпадов.
 * @param pattern Длительность или массив вида [вибрировать, пауза, вибрировать...]
 * @param vibrationEnabled Включен ли режим вибрации в настройках игры
 */
export function triggerUnifiedVibration(pattern: number | number[], vibrationEnabled: boolean = true): void {
  if (!vibrationEnabled) {
    stopUnifiedVibration();
    return;
  }

  // 1. Мобильная вибрация (телефон)
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      if (pattern === 0 || (Array.isArray(pattern) && pattern.length === 0)) {
        navigator.vibrate(0);
      } else {
        navigator.vibrate(pattern);
      }
    } catch (e) {
      // Игнорируем блокировки браузера (для безопасности)
    }
  }

  // 2. Вибрация геймпада
  if (pattern === 0 || (Array.isArray(pattern) && pattern.length === 0)) {
    stopGamepadVibration();
  } else {
    vibrateGamepad(pattern);
  }
}

/**
 * Полностью сбрасывает и останавливает все виды вибраций (и телефон, и геймпад).
 */
export function stopUnifiedVibration(): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(0);
    } catch (e) {}
  }
  stopGamepadVibration();
}
