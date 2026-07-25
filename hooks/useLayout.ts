import { useState, useLayoutEffect, useRef } from 'react';

export function useLayout() {
    const [isLandscape, setIsLandscape] = useState(false);
    const [headerHeight, setHeaderHeight] = useState<number | undefined>(undefined);
    const [iframeTopOffset, setIframeTopOffset] = useState<number>(0);
    const lastWidthRef = useRef<number>(0);
    const lastHeightRef = useRef<number>(0);

    useLayoutEffect(() => {
        const updateLayout = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;

            // Избегаем повторного вычисления и ре-рендеров, если фактический размер окна не изменился
            if (w === lastWidthRef.current && h === lastHeightRef.current) {
                return;
            }
            lastWidthRef.current = w;
            lastHeightRef.current = h;

            const isLand = w > h;
            setIsLandscape(isLand);

            // Детектируем, запущена ли игра в iframe
            const inIframe = (() => {
                try {
                    return window.self !== window.top;
                } catch (e) {
                    return true;
                }
            })();

            // Вычисляем отступ в зависимости от доступного пространства
            let calculatedOffset = 0;
            if (inIframe) {
                // Рассчитываем динамически на базе высоты фрейма
                if (h > 720) {
                    calculatedOffset = 24;
                } else if (h > 600) {
                    calculatedOffset = 16;
                } else if (h > 500) {
                    calculatedOffset = 8;
                } else {
                    calculatedOffset = 0;
                }
            } else {
                // Если запущено не в iframe, то отступ не требуется
                calculatedOffset = 0;
            }

            setIframeTopOffset(calculatedOffset);

            if (isLand) {
                // Calculate ideal game view height for 4:3 aspect ratio based on available width
                // Available width is approx 80% (flex-4 vs flex-1)
                const availableWidth = w * 0.8;
                const idealGameHeight = availableWidth * 0.75; // 4:3 ratio
                
                // Учитываем отступ фрейма в расчетах высоты хедера
                const adjustedH = Math.max(200, h - calculatedOffset);
                const calculatedHeaderHeight = Math.max(60, adjustedH - idealGameHeight);
                setHeaderHeight(Math.floor(calculatedHeaderHeight));
            } else {
                setHeaderHeight(undefined);
            }
        };
        updateLayout();
        window.addEventListener('resize', updateLayout);
        return () => window.removeEventListener('resize', updateLayout);
    }, []);

    return { isLandscape, headerHeight, iframeTopOffset };
}

