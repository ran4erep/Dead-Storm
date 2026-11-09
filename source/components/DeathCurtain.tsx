import React from 'react';

interface DeathCurtainProps {
    deathAnimProgress: number;
}

const DeathCurtain: React.FC<DeathCurtainProps> = ({ deathAnimProgress }) => {
    if (deathAnimProgress <= 0) return null;

    let curtainHeight = 0;
    if (deathAnimProgress > 0.15 && deathAnimProgress <= 0.35) {
        // Close: 0 to 50%
        curtainHeight = ((deathAnimProgress - 0.15) / 0.2) * 50;
    } else if (deathAnimProgress > 0.35 && deathAnimProgress <= 0.45) {
        // Open slightly: 50% to 40%
        curtainHeight = 50 - ((deathAnimProgress - 0.35) / 0.1) * 10;
    } else if (deathAnimProgress > 0.45 && deathAnimProgress <= 0.6) {
        // Close completely: 40% to 50%
        curtainHeight = 40 + ((deathAnimProgress - 0.45) / 0.15) * 10;
    } else if (deathAnimProgress > 0.6) {
        curtainHeight = 50;
    }

    if (curtainHeight <= 0) return null;

    return (
        <>
            <div 
                className="absolute top-0 left-0 w-full bg-black z-[999]" 
                style={{ height: `${curtainHeight}%` }} 
            />
            <div 
                className="absolute bottom-0 left-0 w-full bg-black z-[999]" 
                style={{ height: `${curtainHeight}%` }} 
            />
        </>
    );
};

export default React.memo(DeathCurtain);
