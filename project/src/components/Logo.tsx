type LogoProps = {
  size?: number;
  showText?: boolean;
  variant?: 'dark' | 'light';
  className?: string;
};

export function Logo({ size = 40, showText = true, variant = 'light', className = '' }: LogoProps) {
  const textColor = variant === 'dark' ? 'text-slate-900' : 'text-white';
  const subColor = variant === 'dark' ? 'text-slate-500' : 'text-blue-300';

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <img
        src="/zhuri-transcare-logo.svg"
        alt="Zhuri Transcare logo"
        width={size}
        height={size}
        className="rounded-full shrink-0"
      />
      {showText && (
        <div className="leading-tight">
          <div className={`font-bold ${textColor} text-lg tracking-tight`}>Zhuri</div>
          <div className={`text-[10px] font-semibold ${subColor} uppercase tracking-widest -mt-0.5`}>Transcare</div>
        </div>
      )}
    </div>
  );
}
