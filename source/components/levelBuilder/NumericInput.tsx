import React, { useState, useEffect } from "react";

interface NumericInputProps {
  value: any;
  placeholder?: string;
  onChange: (val: number | undefined) => void;
  className?: string;
  id?: string;
}

export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  placeholder,
  onChange,
  className,
  id
}) => {
  const getInitialString = (val: any) => {
    if (val === undefined || val === null || val === "") return "";
    return val.toString();
  };

  const [localValue, setLocalValue] = useState<string>(getInitialString(value));

  useEffect(() => {
    const currentString = getInitialString(value);
    const parsedLocal = parseFloat(localValue);
    const parsedProp = parseFloat(currentString);

    const isLocalNaN = isNaN(parsedLocal);
    const isPropNaN = isNaN(parsedProp);

    if (isLocalNaN && isPropNaN) {
      const isIntermediate =
        localValue === "-" ||
        localValue === "." ||
        localValue === "-." ||
        localValue === "+";
      if (currentString === "" && !isIntermediate && localValue !== "") {
        setLocalValue("");
      }
    } else if (parsedLocal !== parsedProp) {
      setLocalValue(currentString);
    }
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      data-original-type="number"
      id={id}
      placeholder={placeholder}
      value={localValue}
      onChange={(e) => {
        let txt = e.target.value.replace(",", ".");
        if (txt === "" || /^-?[0-9]*\.?[0-9]*$/.test(txt)) {
          setLocalValue(txt);
          const parsed = parseFloat(txt);
          onChange(isNaN(parsed) ? undefined : parsed);
        }
      }}
      className={className}
    />
  );
};
