import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { MessageSquare, Sparkles } from "lucide-react"
import { ChatMessageList } from "./ChatMessageList"
import { ChatInput } from "./ChatInput"
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/contexts/AuthContext"

interface ChatMessage {
  id: string
  content: string
  sender: "user" | "ai"
  timestamp: Date
  isFavorite?: boolean
}

interface ChatInterfaceProps {
  selectedChat: string | null
  onSelectChat: (chatId: string | null) => void
}

export function ChatInterface({ selectedChat, onSelectChat }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputMessage, setInputMessage] = useState("")
  const [isRecording, setIsRecording] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()
  const { currentOrganization } = useAuth()

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return

    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      content: inputMessage,
      sender: "user",
      timestamp: new Date()
    }

    setMessages(prev => [...prev, newMessage])
    setInputMessage("")
    setIsLoading(true)

    try {
      const { data, error } = await supabase.functions.invoke('chat-with-dona', {
        body: { 
          message: inputMessage,
          context: {
            organization: currentOrganization
          }
        }
      })

      if (error) throw error

      if (!data?.response) {
        throw new Error('Invalid response from DONA')
      }

      const aiResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: data.response,
        sender: "ai",
        timestamp: new Date()
      }

      setMessages(prev => [...prev, aiResponse])
    } catch (error) {
      console.error('Error in handleSendMessage:', error)
      toast({
        title: "Erro ao processar mensagem",
        description: "Não foi possível obter resposta da DONA. Tente novamente.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleVoiceRecord = () => {
    setIsRecording(!isRecording)
    toast({
      title: isRecording ? "Gravação finalizada" : "Gravando...",
      description: isRecording ? "Processando sua mensagem..." : "Fale sua mensagem"
    })
  }

  const handleGenerateImage = () => {
    toast({
      title: "Gerando imagem",
      description: "A DONA está processando sua solicitação..."
    })
  }

  const toggleFavorite = (messageId: string) => {
    setMessages(prev =>
      prev.map(msg =>
        msg.id === messageId
          ? { ...msg, isFavorite: !msg.isFavorite }
          : msg
      )
    )
  }

  return (
    <div className="flex flex-col h-full bg-card rounded-lg border shadow-sm">
      <div className="p-4 border-b backdrop-blur-sm bg-background/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-purple-500" />
          <h2 className="text-lg font-semibold">Chat com DONA</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-purple-500 hover:text-purple-600 transition-colors"
            onClick={handleGenerateImage}
          >
            <Sparkles className="h-4 w-4 mr-1" />
            Gerar Imagem
          </Button>
        </div>
      </div>

      <ChatMessageList messages={messages} onToggleFavorite={toggleFavorite} />

      <div className="border-t">
        <ChatInput
          inputMessage={inputMessage}
          onInputChange={setInputMessage}
          onSendMessage={handleSendMessage}
          onFileUpload={() => {}}
          onImageUpload={handleGenerateImage}
          onVoiceRecord={handleVoiceRecord}
          isRecording={isRecording}
          isLoading={isLoading}
        />
      </div>
    </div>
  )
}