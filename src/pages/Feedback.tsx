
import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { MessageSquare, PlusCircle, BarChart2, Send, Loader2, Mail, Copy, Link2, ArrowUpRight, Users, CheckCircle, Clock, Settings2, ExternalLink, Filter, Eye, Trash2, Edit, HelpCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/integrations/supabase/client"
import { useOrganization } from "@/hooks/useOrganization"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

type NPSSurvey = {
  id: string
  title: string
  description: string | null
  status: 'draft' | 'active' | 'inactive' | 'archived' | 'completed'
  created_at: string
  type: 'simple' | 'detailed' | 'advanced'
  organization_id: string
  settings: any
}

type AIPromptType = 'manual' | 'recommend'

type QuestionType = 'nps' | 'text' | 'opcoes' | 'rating'

interface Question {
  tipo: QuestionType
  texto: string
  opcoes?: string[]
  obrigatoria?: boolean
}

export default function Feedback() {
  const [surveys, setSurveys] = useState<NPSSurvey[]>([])
  const [loading, setLoading] = useState(true)
  const [creatingNewSurvey, setCreatingNewSurvey] = useState(false)
  const [surveyTitle, setSurveyTitle] = useState("")
  const [surveyDescription, setSurveyDescription] = useState("")
  const [aiPrompt, setAiPrompt] = useState("")
  const [aiSuggestion, setAiSuggestion] = useState("")
  const [promptType, setPromptType] = useState<AIPromptType>("manual")
  const [generatingPrompt, setGeneratingPrompt] = useState(false)
  const [activeTab, setActiveTab] = useState("todas")
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState("")
  const [questions, setQuestions] = useState<Question[]>([])
  const [viewSurvey, setViewSurvey] = useState<NPSSurvey | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [surveyStats, setSurveyStats] = useState<any>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const { toast } = useToast()
  const { currentOrganization } = useOrganization()

  useEffect(() => {
    if (currentOrganization) {
      fetchSurveys()
    }
  }, [currentOrganization])

  // Gera URL para compartilhar a pesquisa
  useEffect(() => {
    if (selectedSurveyId) {
      setShareUrl(`${window.location.origin}/s/${selectedSurveyId}`)
    }
  }, [selectedSurveyId])

  const fetchSurveys = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('nps_surveys')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      setSurveys(data || [])
    } catch (error: any) {
      console.error('Erro ao buscar pesquisas:', error)
      toast({
        title: "Erro",
        description: "Não foi possível carregar as pesquisas de feedback.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchSurveyStats = async (surveyId: string) => {
    try {
      setStatsLoading(true)
      
      // Buscar estatísticas de NPS usando a função do banco de dados
      const { data, error } = await supabase.rpc('calculate_nps_metrics', {
        survey_id: surveyId
      })

      if (error) throw error
      
      setSurveyStats(data)
    } catch (error: any) {
      console.error('Erro ao buscar estatísticas:', error)
      toast({
        title: "Erro",
        description: "Não foi possível carregar as estatísticas da pesquisa.",
        variant: "destructive"
      })
    } finally {
      setStatsLoading(false)
    }
  }

  const generateSurveyWithAI = async () => {
    try {
      setGeneratingPrompt(true)
      
      let systemPrompt = ""
      
      if (promptType === "manual") {
        if (!aiPrompt.trim()) {
          throw new Error("Por favor, descreva o que você deseja avaliar.")
        }
        systemPrompt = aiPrompt
      } else {
        // Modo recomendação baseado no contexto da organização
        systemPrompt = `Minha organização é ${currentOrganization?.name}. 
          Por favor, sugira uma pesquisa de satisfação de clientes relevante para meu negócio.`
      }

      const response = await fetch(
        `${window.location.origin}/functions/v1/chat-with-dona`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: `Crie uma pesquisa de feedback para clientes com as seguintes especificações:
              1. Título sugestivo e profissional
              2. Descrição clara do propósito da pesquisa
              3. Sugira 3-5 perguntas relevantes para ${systemPrompt}
              4. Para a pergunta principal de NPS, use a escala de 0-10
              5. Formate a resposta com título, descrição e lista de perguntas
              
              Responda com uma estrutura JSON assim:
              {
                "titulo": "Título da pesquisa",
                "descricao": "Descrição da pesquisa",
                "perguntas": [
                  {"tipo": "nps", "texto": "Em uma escala de 0 a 10, o quanto você recomendaria..."},
                  {"tipo": "text", "texto": "O que podemos melhorar?"},
                  {"tipo": "opcoes", "texto": "Qual recurso você mais utiliza?", "opcoes": ["Opção 1", "Opção 2"]}
                ]
              }`
          }),
        }
      )

      const data = await response.json()
      
      if (!data.response) {
        throw new Error("Não foi possível gerar a pesquisa.")
      }

      // Tenta extrair o JSON da resposta da IA
      try {
        const jsonStart = data.response.indexOf('{')
        const jsonEnd = data.response.lastIndexOf('}') + 1
        const jsonStr = data.response.substring(jsonStart, jsonEnd)
        const parsedData = JSON.parse(jsonStr)
        
        setSurveyTitle(parsedData.titulo || "")
        setSurveyDescription(parsedData.descricao || "")
        setQuestions(parsedData.perguntas || [])
        setAiSuggestion(JSON.stringify(parsedData, null, 2))
      } catch (e) {
        // Se falhar ao extrair JSON, usa a resposta bruta
        setAiSuggestion(data.response)
        
        // Tenta extrair título e descrição do texto
        const lines = data.response.split('\n')
        if (lines.length > 0) setSurveyTitle(lines[0].replace(/^[#\s]+/, ''))
        if (lines.length > 1) setSurveyDescription(lines.slice(1, 3).join(' ').trim())
      }

    } catch (error: any) {
      console.error('Erro ao gerar pesquisa com IA:', error)
      toast({
        title: "Erro",
        description: error.message || "Não foi possível gerar a pesquisa com a IA.",
        variant: "destructive"
      })
    } finally {
      setGeneratingPrompt(false)
    }
  }

  const createSurvey = async () => {
    try {
      if (!surveyTitle) {
        toast({
          title: "Erro",
          description: "O título da pesquisa é obrigatório.",
          variant: "destructive"
        })
        return
      }

      if (!currentOrganization) {
        toast({
          title: "Erro",
          description: "Nenhuma organização selecionada.",
          variant: "destructive"
        })
        return
      }

      const { data, error } = await supabase
        .from('nps_surveys')
        .insert({
          organization_id: currentOrganization.id,
          title: surveyTitle,
          description: surveyDescription,
          status: 'draft',
          type: questions.length > 3 ? 'detailed' : 'simple',
          settings: {
            ai_suggestion: aiSuggestion,
            questions: questions
          }
        })
        .select()

      if (error) throw error

      toast({
        title: "Sucesso",
        description: "Pesquisa de feedback criada com sucesso!",
      })

      // Limpa os campos e fecha o modal
      setSurveyTitle("")
      setSurveyDescription("")
      setAiPrompt("")
      setAiSuggestion("")
      setQuestions([])
      setCreatingNewSurvey(false)
      
      // Atualiza a lista de pesquisas
      await fetchSurveys()
    } catch (error: any) {
      console.error('Erro ao criar pesquisa:', error)
      toast({
        title: "Erro",
        description: "Não foi possível criar a pesquisa.",
        variant: "destructive"
      })
    }
  }

  const updateSurveyStatus = async (id: string, status: NPSSurvey['status']) => {
    try {
      const { error } = await supabase
        .from('nps_surveys')
        .update({ status })
        .eq('id', id)

      if (error) throw error

      toast({
        title: "Status atualizado",
        description: `A pesquisa foi ${status === 'active' ? 'ativada' : 
                                       status === 'inactive' ? 'desativada' : 
                                       status === 'archived' ? 'arquivada' : 
                                       'atualizada'} com sucesso.`,
      })

      // Atualiza a lista de pesquisas
      fetchSurveys()
    } catch (error: any) {
      console.error('Erro ao atualizar status:', error)
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o status da pesquisa.",
        variant: "destructive"
      })
    }
  }

  const deleteSurvey = async (id: string) => {
    try {
      const { error } = await supabase
        .from('nps_surveys')
        .delete()
        .eq('id', id)

      if (error) throw error

      toast({
        title: "Pesquisa excluída",
        description: "A pesquisa foi excluída com sucesso.",
      })

      setConfirmDeleteId(null)
      // Atualiza a lista de pesquisas
      fetchSurveys()
    } catch (error: any) {
      console.error('Erro ao excluir pesquisa:', error)
      toast({
        title: "Erro",
        description: "Não foi possível excluir a pesquisa.",
        variant: "destructive"
      })
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: "Copiado!",
      description: "Link copiado para a área de transferência.",
    })
  }

  const filteredSurveys = surveys.filter(survey => {
    if (activeTab === "todas") return true
    return survey.status === activeTab
  })

  const getStatusBadge = (status: NPSSurvey['status']) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">Ativo</Badge>
      case 'draft':
        return <Badge variant="outline">Rascunho</Badge>
      case 'completed':
        return <Badge className="bg-blue-100 text-blue-800">Concluído</Badge>
      case 'inactive':
        return <Badge variant="secondary">Inativo</Badge>
      case 'archived':
        return <Badge variant="destructive">Arquivado</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            <h1 className="text-2xl font-bold">Feedback de Clientes</h1>
          </div>
          
          <Sheet open={creatingNewSurvey} onOpenChange={setCreatingNewSurvey}>
            <SheetTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                Nova Pesquisa
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Criar Nova Pesquisa</SheetTitle>
                <SheetDescription>
                  Use a IA para ajudar a criar um formulário de feedback eficiente ou adicione manualmente.
                </SheetDescription>
              </SheetHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Select 
                    defaultValue="manual" 
                    onValueChange={(value) => setPromptType(value as AIPromptType)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o modo de criação" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual - Descreva o que deseja avaliar</SelectItem>
                      <SelectItem value="recommend">Recomendado pela IA - Baseado no contexto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {promptType === "manual" && (
                  <div className="space-y-2">
                    <Label htmlFor="aiPrompt">Descreva o que você deseja avaliar</Label>
                    <Textarea 
                      id="aiPrompt" 
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="Ex: Quero avaliar a satisfação dos clientes com nosso novo produto..."
                      className="min-h-[100px]"
                    />
                  </div>
                )}

                <Button 
                  onClick={generateSurveyWithAI} 
                  disabled={generatingPrompt || (promptType === "manual" && !aiPrompt.trim())}
                  className="w-full"
                >
                  {generatingPrompt ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Gerando pesquisa...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Gerar com IA
                    </>
                  )}
                </Button>
                
                {aiSuggestion && (
                  <>
                    <Alert>
                      <AlertTitle>Sugestão da IA</AlertTitle>
                      <AlertDescription>
                        <div className="max-h-[200px] overflow-y-auto whitespace-pre-wrap text-xs">
                          {aiSuggestion}
                        </div>
                      </AlertDescription>
                    </Alert>
                    
                    {questions.length > 0 && (
                      <div className="space-y-2 border border-border rounded-md p-3">
                        <h4 className="font-medium">Perguntas sugeridas:</h4>
                        <ul className="space-y-2 text-sm">
                          {questions.map((q, index) => (
                            <li key={index} className="p-2 bg-muted/40 rounded">
                              <div className="font-medium">{q.texto}</div>
                              <div className="text-xs text-muted-foreground mt-1">
                                Tipo: {q.tipo === 'nps' ? 'NPS (0-10)' : 
                                       q.tipo === 'text' ? 'Texto livre' : 
                                       q.tipo === 'opcoes' ? 'Múltipla escolha' : 
                                       'Avaliação'}
                              </div>
                              {q.tipo === 'opcoes' && q.opcoes && (
                                <div className="text-xs mt-1">
                                  Opções: {q.opcoes.join(', ')}
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="title">Título da Pesquisa</Label>
                  <Input 
                    id="title" 
                    value={surveyTitle}
                    onChange={(e) => setSurveyTitle(e.target.value)}
                    placeholder="Ex: Pesquisa de Satisfação Q2 2023"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição (opcional)</Label>
                  <Textarea 
                    id="description" 
                    value={surveyDescription}
                    onChange={(e) => setSurveyDescription(e.target.value)}
                    placeholder="Descreva o propósito desta pesquisa..."
                  />
                </div>
                
                <Button onClick={createSurvey} className="w-full">
                  Criar Pesquisa
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <Tabs defaultValue="todas" value={activeTab} onValueChange={setActiveTab}>
          <div className="flex justify-between items-center mb-4">
            <TabsList>
              <TabsTrigger value="todas">Todas</TabsTrigger>
              <TabsTrigger value="draft">Rascunhos</TabsTrigger>
              <TabsTrigger value="active">Ativas</TabsTrigger>
              <TabsTrigger value="inactive">Inativas</TabsTrigger>
              <TabsTrigger value="archived">Arquivadas</TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Filter className="h-4 w-4 mr-1" />
                      Filtrar
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Filtrar pesquisas</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" className="hidden md:flex">
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Configurações</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          <TabsContent value={activeTab}>
            <Card className="p-6">
              {loading ? (
                <div className="flex items-center justify-center h-[400px]">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredSurveys.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[400px] space-y-4">
                  <MessageSquare className="h-16 w-16 text-muted-foreground" />
                  <p className="text-muted-foreground text-center">
                    Nenhuma pesquisa {activeTab !== "todas" ? `com status "${activeTab}"` : ""} encontrada.<br />
                    Crie sua primeira pesquisa para começar a coletar feedback dos clientes.
                  </p>
                  <Button onClick={() => setCreatingNewSurvey(true)}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Criar Pesquisa
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableCaption>Lista de pesquisas de feedback</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Título</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Data de Criação</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSurveys.map((survey) => (
                      <TableRow key={survey.id}>
                        <TableCell className="font-medium">{survey.title}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{survey.description || "-"}</TableCell>
                        <TableCell>
                          {getStatusBadge(survey.status)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {survey.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{new Date(survey.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => {
                                      setSelectedSurveyId(survey.id)
                                      setShareDialogOpen(true)
                                    }}
                                  >
                                    <Link2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Compartilhar</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => {
                                      setViewSurvey(survey)
                                      if (survey.status === 'active' || survey.status === 'completed') {
                                        fetchSurveyStats(survey.id)
                                      }
                                    }}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Visualizar</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            {survey.status === 'draft' && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button 
                                      variant="default" 
                                      size="sm"
                                      onClick={() => updateSurveyStatus(survey.id, 'active')}
                                    >
                                      <ArrowUpRight className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Publicar</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}

                            {survey.status === 'active' && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button 
                                      variant="secondary" 
                                      size="sm"
                                      onClick={() => updateSurveyStatus(survey.id, 'inactive')}
                                    >
                                      <Clock className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Pausar</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}

                            {survey.status === 'inactive' && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      onClick={() => updateSurveyStatus(survey.id, 'active')}
                                    >
                                      <CheckCircle className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Reativar</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}

                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => setConfirmDeleteId(survey.id)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Excluir</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal de compartilhamento */}
        <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Compartilhar Pesquisa</DialogTitle>
              <DialogDescription>
                Compartilhe este link com seus clientes para coletar feedback.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 mt-4">
              <div className="flex items-center space-x-2">
                <Input 
                  value={shareUrl} 
                  readOnly 
                  className="flex-1"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => copyToClipboard(shareUrl)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Também compartilhar via:</h4>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <Mail className="h-4 w-4 mr-2" />
                    Email
                  </Button>
                  <Button variant="outline" size="sm">
                    <Users className="h-4 w-4 mr-2" />
                    Contatos
                  </Button>
                  <Button variant="outline" size="sm">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Exportar
                  </Button>
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShareDialogOpen(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal de visualização da pesquisa */}
        <Dialog open={!!viewSurvey} onOpenChange={(open) => !open && setViewSurvey(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{viewSurvey?.title}</DialogTitle>
              <DialogDescription>
                {viewSurvey?.description || "Sem descrição"}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 mt-4">
              <div className="flex flex-wrap gap-2">
                {getStatusBadge(viewSurvey?.status || 'draft')}
                <Badge variant="outline" className="capitalize">
                  {viewSurvey?.type}
                </Badge>
                <Badge variant="secondary">
                  <Clock className="h-3 w-3 mr-1" />
                  Criada em {viewSurvey && new Date(viewSurvey.created_at).toLocaleDateString()}
                </Badge>
              </div>
              
              <Tabs defaultValue="perguntas">
                <TabsList className="w-full">
                  <TabsTrigger value="perguntas" className="flex-1">Perguntas</TabsTrigger>
                  <TabsTrigger value="resultados" className="flex-1">Resultados</TabsTrigger>
                  <TabsTrigger value="configuracoes" className="flex-1">Configurações</TabsTrigger>
                </TabsList>
                
                <TabsContent value="perguntas" className="space-y-4 py-4">
                  {viewSurvey?.settings?.questions?.length > 0 ? (
                    <div className="space-y-4">
                      {viewSurvey.settings.questions.map((q: Question, i: number) => (
                        <div key={i} className="border rounded-lg p-4 space-y-2">
                          <div className="flex justify-between">
                            <h4 className="font-medium">{q.texto}</h4>
                            <Badge variant="outline">
                              {q.tipo === 'nps' ? 'NPS (0-10)' : 
                               q.tipo === 'text' ? 'Texto livre' : 
                               q.tipo === 'opcoes' ? 'Múltipla escolha' : 
                               'Avaliação'}
                            </Badge>
                          </div>
                          
                          {q.tipo === 'nps' && (
                            <div className="grid grid-cols-11 gap-1 mt-2">
                              {Array.from({length: 11}).map((_, i) => (
                                <div 
                                  key={i} 
                                  className="flex items-center justify-center h-8 rounded-md bg-muted/50 text-sm"
                                >
                                  {i}
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {q.tipo === 'text' && (
                            <div className="mt-2">
                              <Input disabled placeholder="Resposta do cliente" />
                            </div>
                          )}
                          
                          {q.tipo === 'opcoes' && q.opcoes && (
                            <div className="space-y-2 mt-2">
                              {q.opcoes.map((opt, j) => (
                                <div key={j} className="flex items-center space-x-2">
                                  <input type="radio" disabled />
                                  <span>{opt}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {q.tipo === 'rating' && (
                            <div className="flex gap-1 mt-2">
                              {Array.from({length: 5}).map((_, i) => (
                                <div key={i} className="text-lg text-muted-foreground">★</div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 space-y-4 text-center">
                      <HelpCircle className="h-12 w-12 text-muted-foreground" />
                      <div>
                        <p className="text-muted-foreground">
                          Não foi possível encontrar as perguntas desta pesquisa.
                        </p>
                        <p className="text-sm text-muted-foreground">
                          É possível que a pesquisa tenha sido criada antes da implementação do sistema de perguntas.
                        </p>
                      </div>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="resultados">
                  {(viewSurvey?.status === 'active' || viewSurvey?.status === 'completed') ? (
                    statsLoading ? (
                      <div className="flex items-center justify-center h-[200px]">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : surveyStats ? (
                      <div className="space-y-6 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <Card className="p-4">
                            <div className="text-sm text-muted-foreground">Respostas totais</div>
                            <div className="text-2xl font-bold mt-1">{surveyStats.total_responses}</div>
                          </Card>
                          
                          <Card className="p-4">
                            <div className="text-sm text-muted-foreground">Score NPS</div>
                            <div className="text-2xl font-bold mt-1">{surveyStats.nps_score}</div>
                          </Card>
                          
                          <Card className="p-4">
                            <div className="text-sm text-muted-foreground">Promotores</div>
                            <div className="text-2xl font-bold mt-1 text-green-600">
                              {surveyStats.promoters_percentage}%
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {surveyStats.promoters} respostas
                            </div>
                          </Card>
                          
                          <Card className="p-4">
                            <div className="text-sm text-muted-foreground">Detratores</div>
                            <div className="text-2xl font-bold mt-1 text-red-600">
                              {surveyStats.detractors_percentage}%
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {surveyStats.detractors} respostas
                            </div>
                          </Card>
                        </div>
                        
                        <Card className="p-6">
                          <h3 className="text-lg font-medium mb-4">Distribuição de Respostas</h3>
                          <div className="space-y-6">
                            <div className="space-y-2">
                              <div className="flex justify-between text-sm">
                                <span>Promotores (9-10)</span>
                                <span>{surveyStats.promoters_percentage}%</span>
                              </div>
                              <Progress value={surveyStats.promoters_percentage} className="h-2 bg-muted" />
                            </div>
                            
                            <div className="space-y-2">
                              <div className="flex justify-between text-sm">
                                <span>Neutros (7-8)</span>
                                <span>{surveyStats.passives_percentage}%</span>
                              </div>
                              <Progress value={surveyStats.passives_percentage} className="h-2 bg-muted" />
                            </div>
                            
                            <div className="space-y-2">
                              <div className="flex justify-between text-sm">
                                <span>Detratores (0-6)</span>
                                <span>{surveyStats.detractors_percentage}%</span>
                              </div>
                              <Progress value={surveyStats.detractors_percentage} className="h-2 bg-muted" />
                            </div>
                          </div>
                        </Card>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-10 space-y-4 text-center">
                        <BarChart2 className="h-12 w-12 text-muted-foreground" />
                        <div>
                          <p className="text-muted-foreground">
                            Nenhum resultado encontrado para esta pesquisa.
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Compartilhe a pesquisa com seus clientes para começar a coletar respostas.
                          </p>
                        </div>
                        <Button
                          onClick={() => {
                            setShareDialogOpen(true)
                            setSelectedSurveyId(viewSurvey?.id || null)
                          }}
                        >
                          <Link2 className="mr-2 h-4 w-4" />
                          Compartilhar Pesquisa
                        </Button>
                      </div>
                    )
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 space-y-4 text-center">
                      <BarChart2 className="h-12 w-12 text-muted-foreground" />
                      <div>
                        <p className="text-muted-foreground">
                          Resultados disponíveis apenas para pesquisas ativas ou concluídas.
                        </p>
                        {viewSurvey?.status === 'draft' && (
                          <p className="text-sm text-muted-foreground">
                            Publique esta pesquisa para começar a coletar respostas.
                          </p>
                        )}
                      </div>
                      {viewSurvey?.status === 'draft' && (
                        <Button
                          onClick={() => {
                            updateSurveyStatus(viewSurvey.id, 'active')
                            setViewSurvey(null)
                          }}
                        >
                          <ArrowUpRight className="mr-2 h-4 w-4" />
                          Publicar Pesquisa
                        </Button>
                      )}
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="configuracoes" className="space-y-4 py-4">
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Status atual</Label>
                        <Select defaultValue={viewSurvey?.status} disabled={!viewSurvey}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">Rascunho</SelectItem>
                            <SelectItem value="active">Ativa</SelectItem>
                            <SelectItem value="inactive">Inativa</SelectItem>
                            <SelectItem value="completed">Concluída</SelectItem>
                            <SelectItem value="archived">Arquivada</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Tipo de pesquisa</Label>
                        <Select defaultValue={viewSurvey?.type} disabled={!viewSurvey}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="simple">Simples</SelectItem>
                            <SelectItem value="detailed">Detalhada</SelectItem>
                            <SelectItem value="advanced">Avançada</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Título da pesquisa</Label>
                      <Input defaultValue={viewSurvey?.title} disabled={!viewSurvey} />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Descrição</Label>
                      <Textarea defaultValue={viewSurvey?.description || ""} disabled={!viewSurvey} />
                    </div>
                    
                    <Button disabled variant="outline" className="w-full">
                      <Edit className="mr-2 h-4 w-4" />
                      Editar Pesquisa
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewSurvey(null)}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal de confirmação de exclusão */}
        <Dialog open={!!confirmDeleteId} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar exclusão</DialogTitle>
              <DialogDescription>
                Tem certeza que deseja excluir esta pesquisa? Esta ação não pode ser desfeita.
              </DialogDescription>
            </DialogHeader>
            
            <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
              <Button 
                variant="outline" 
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancelar
              </Button>
              <Button 
                variant="destructive"
                onClick={() => confirmDeleteId && deleteSurvey(confirmDeleteId)}
              >
                Excluir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
