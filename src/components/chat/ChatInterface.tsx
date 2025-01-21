import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { MessageSquare, Sparkles } from "lucide-react"
import { FileList } from "./FileList"
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

type FileType = "json" | "csv" | "excel" | "access"

const getFileType = (extension: string): FileType | null => {
  const fileTypes: Record<string, FileType> = {
    json: 'json',
    csv: 'csv',
    xlsx: 'excel',
    xls: 'excel',
    accdb: 'access'
  }
  return fileTypes[extension.toLowerCase()] as FileType || null
}

export function ChatInterface({ selectedChat, onSelectChat }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputMessage, setInputMessage] = useState("")
  const [isRecording, setIsRecording] = useState(false)
  const [files, setFiles] = useState<any[]>([])
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()
  const { currentOrganization } = useAuth()

  const fetchFiles = useCallback(async () => {
    if (!currentOrganization?.id) return

    try {
      const { data, error } = await supabase
        .from('data_files')
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading files:', error)
        return
      }

      setFiles(data || [])
    } catch (error) {
      console.error('Error in fetchFiles:', error)
    }
  }, [currentOrganization?.id])

  useEffect(() => {
    let isMounted = true

    if (currentOrganization?.id && isMounted) {
      fetchFiles()
    }

    return () => {
      isMounted = false
    }
  }, [currentOrganization?.id, fetchFiles])

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
            selectedFiles,
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !currentOrganization?.id) return

    const fileExt = file.name.split('.').pop()?.toLowerCase()
    if (!fileExt) {
      toast({
        title: "Erro no upload",
        description: "Arquivo sem extensão",
        variant: "destructive",
      })
      return
    }

    const fileType = getFileType(fileExt)
    if (!fileType) {
      toast({
        title: "Erro no upload",
        description: "Tipo de arquivo não suportado",
        variant: "destructive",
      })
      return
    }

    try {
      const fileName = `${crypto.randomUUID()}.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from('data-files')
        .upload(fileName, file)

      if (uploadError) throw uploadError

      const { error: dbError } = await supabase
        .from('data_files')
        .insert({
          file_name: file.name,
          file_path: fileName,
          file_type: fileType,
          file_size: file.size,
          content_type: file.type,
          status: 'pending',
          preview_data: {},
          organization_id: currentOrganization.id
        })

      if (dbError) throw dbError

      toast({
        title: "Arquivo enviado com sucesso",
        description: "Seu arquivo está sendo processado.",
      })

      fetchFiles()
    } catch (error) {
      console.error('Error in handleFileUpload:', error)
      toast({
        title: "Erro no upload",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      })
    }
  }

  const handleDeleteFile = async (fileId: string) => {
    try {
      const { error } = await supabase
        .from('data_files')
        .delete()
        .eq('id', fileId)

      if (error) throw error

      toast({
        title: "Arquivo deletado com sucesso",
      })

      fetchFiles()
    } catch (error) {
      console.error('Error in handleDeleteFile:', error)
      toast({
        title: "Erro ao deletar arquivo",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      })
    }
  }

  const handleToggleFileSelect = (fileId: string) => {
    setSelectedFiles(prev => {
      if (prev.includes(fileId)) {
        return prev.filter(id => id !== fileId)
      }
      return [...prev, fileId]
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

  return (
    <div className="flex flex-col flex-1 bg-card rounded-lg border shadow-sm">
      <div className="p-4 border-b backdrop-blur-sm bg-background/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-purple-500" />
          <h2 className="text-lg font-semibold">Chat com DONA</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-purple-500 hover:text-purple-600"
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
          onFileUpload={handleFileUpload}
          onImageUpload={handleGenerateImage}
          onVoiceRecord={handleVoiceRecord}
          isRecording={isRecording}
          isLoading={isLoading}
        />

        <div className="p-4 border-t bg-background/50 backdrop-blur-sm">
          <FileList 
            files={files} 
            onDelete={handleDeleteFile}
            selectedFiles={selectedFiles}
            onToggleSelect={handleToggleFileSelect}
          />
        </div>
      </div>
    </div>
  )
}