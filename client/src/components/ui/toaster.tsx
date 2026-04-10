import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react"

function defaultIcon(variant: string | null | undefined) {
  switch (variant) {
    case "success":  return <CheckCircle  className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
    case "warning":  return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
    case "destructive": return <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
    default: return null
  }
}

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, icon, variant, ...props }) {
        const iconNode = icon ?? defaultIcon(variant)
        return (
          <Toast key={id} variant={variant} {...props}>
            <div className="flex items-start gap-3 flex-1 min-w-0">
              {iconNode && <div>{iconNode}</div>}
              <div className="grid gap-1 flex-1 min-w-0">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
