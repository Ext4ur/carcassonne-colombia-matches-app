import { InputHTMLAttributes, LabelHTMLAttributes, ChangeEvent, useMemo } from 'react';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  label?: string;
  error?: string;
  helperText?: string;
  type?: 'text' | 'email' | 'password' | 'date' | 'tel' | 'number';
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
}

let inputCounter = 0;

export default function Input({
  label,
  error,
  helperText,
  className = '',
  id,
  type = 'text',
  onChange,
  value,
  ...props
}: InputProps) {
  // Use a stable ID that doesn't change on re-renders
  const inputId = useMemo(() => {
    if (id) return id;
    inputCounter++;
    return `input-${inputCounter}`;
  }, [id]);
  
  // Handle number input to only allow integers (no arrows, no decimals)
  const handleNumberChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (onChange) {
      onChange(e);
    }
  };
  
  // Ensure value is always a string for controlled inputs
  const stringValue = value === undefined || value === null ? '' : String(value);
  
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        type={type === 'number' ? 'text' : type}
        className={`input ${error ? 'border-red-500 focus:ring-red-500' : ''} ${type === 'number' ? '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none' : ''} ${className}`}
        onChange={type === 'number' ? handleNumberChange : onChange}
        value={stringValue}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      {helperText && !error && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{helperText}</p>
      )}
    </div>
  );
}



