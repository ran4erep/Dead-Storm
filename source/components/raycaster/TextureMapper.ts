
import { RaycasterBuffer } from './RaycasterUtils';

export const calculateTextureX = (
    isDoor: boolean,
    isDoorFrame: boolean,
    isDoorEdge: boolean,
    isTextureFlipped: boolean,
    doorOffset: number,
    side: number,
    rayDirX: number,
    rayDirY: number,
    posX: number,
    posY: number,
    perpWallDist: number,
    buf: RaycasterBuffer
): number => {
    let texX = 0;
    if (isDoor) {
        if (isDoorFrame) { 
            const frameTexW = (buf.width * 0.15) | 0; 
            texX = (doorOffset * frameTexW) | 0; 
            if (texX >= frameTexW) texX = frameTexW - 1; 
            if (texX < 0) texX = 0; 
        } else if (isDoorEdge) { 
            const frameWidth = (buf.width * 0.2) | 0; 
            texX = (doorOffset * frameWidth) | 0; 
            if (texX >= frameWidth) texX = frameWidth - 1;
            if (texX < 0) texX = 0; 
        } else { 
            texX = (doorOffset * buf.width) | 0; 
            if (texX >= buf.width) texX = buf.width - 1;
            if (texX < 0) texX = 0;
            if (isTextureFlipped) texX = buf.width - texX - 1; 
        }
    } else {
        let wallX;
        if (side === 0) wallX = posY + perpWallDist * rayDirY; 
        else wallX = posX + perpWallDist * rayDirX;
        wallX -= Math.floor(wallX); 
        texX = (wallX * buf.width) | 0;
        if (side === 0 && rayDirX < 0) texX = buf.width - texX - 1;
        if (side === 1 && rayDirY > 0) texX = buf.width - texX - 1;
        if (texX < 0) texX = 0;
        if (texX >= buf.width) texX = buf.width - 1;
    }
    return texX;
};
