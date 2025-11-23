import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  ...props 
}) => {
  const baseStyles = "inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg";
  
  const variants = {
    primary: "bg-indigo-600 hover:bg-indigo-700 text-white border-transparent",
    secondary: "bg-gray-200 hover:bg-gray-300 text-gray-800 border border-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-100 dark:border dark:border-gray-600",
    ghost: "bg-transparent hover:bg-gray-100 text-gray-600 hover:text-gray-900 dark:hover:bg-gray-800 dark:text-gray-400 dark:hover:text-white",
    danger: "bg-red-600 hover:bg-red-700 text-white"
  };

  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
