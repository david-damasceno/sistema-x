
import { createContext, useContext, useState, useCallback } from "react"
import { supabase } from "@/integrations/supabase/client"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/contexts/AuthContext"
import { Json } from "@/integrations/supabase/types"

interface Column {
  name: string
  type: string
  sample: any
  nullCount: number
  uniqueCount: number
  patterns: {
    email: boolean
    url: boolean
    phone: boolean
  }
}

interface DataImport {
  id: string
  name: string
  original_filename: string
  storage_path: string | null
  file_type: string
  row_count: number | null
  status: 'pending' | 'processing' | 'completed' | 'error'
  error_message: string | null
  columns_metadata: {
    columns: Column[]
  }
  column_analysis: Column[]
  column_suggestions: string | null
  organization_id: string
  created_by: string
  created_at: string
  table_name: string
  data_quality: Json
  data_validation: Json
}

interface DataImportContextType {
  currentImport: DataImport | null
  setCurrentImport: (importData: DataImport | null) => void
  uploadFile: (file: File) => Promise<string>
  analyzeFile: (fileId: string) => Promise<void>
  loading: boolean
}

const DataImportContext = createContext<DataImportContextType | undefined>(undefined)

export function DataImportProvider({ children }: { children: React.ReactNode }) {
  const [currentImport, setCurrentImport] = useState<DataImport | null>(null)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const { currentOrganization, user } = useAuth()

  const uploadFile = useCallback(async (file: File) => {
    if (!currentOrganization || !user) {
      throw new Error("Usuário não autenticado ou organização não selecionada")
    }

    setLoading(true)
    try {
      // Criar registro do import
      const { data: importData, error: importError } = await supabase
        .from('data_imports')
        .insert({
          organization_id: currentOrganization.id,
          created_by: user.id,
          name: file.name,
          original_filename: file.name,
          file_type: file.type,
          status: 'pending' as const,
          columns_metadata: {},
          column_analysis: [],
          data_quality: {},
          data_validation: {},
          table_name: file.name.replace(/\.[^/.]+$/, "").toLowerCase().replace(/\s+/g, "_")
        })
        .select()
        .single()

      if (importError) throw importError

      // Upload do arquivo
      const filePath = `${currentOrganization.id}/${importData.id}/${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('data_files')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      // Atualizar storage_path e status
      const { data: updatedImport, error: updateError } = await supabase
        .from('data_imports')
        .update({
          storage_path: filePath,
          status: 'processing' as const
        })
        .eq('id', importData.id)
        .select()
        .single()

      if (updateError) throw updateError

      setCurrentImport(updatedImport as unknown as DataImport)
      return importData.id
    } catch (error: any) {
      console.error('Erro no upload:', error)
      toast({
        title: "Erro no upload",
        description: error.message || "Não foi possível fazer o upload do arquivo",
        variant: "destructive"
      })
      throw error
    } finally {
      setLoading(false)
    }
  }, [currentOrganization, user, toast])

  const analyzeFile = useCallback(async (fileId: string) => {
    setLoading(true)
    try {
      const { error } = await supabase.functions
        .invoke('analyze-file', {
          body: { fileId }
        })

      if (error) throw error

      const { data: importData, error: fetchError } = await supabase
        .from('data_imports')
        .select('*')
        .eq('id', fileId)
        .single()

      if (fetchError) throw fetchError

      setCurrentImport(importData as unknown as DataImport)
    } catch (error: any) {
      console.error('Erro na análise:', error)
      toast({
        title: "Erro na análise",
        description: error.message || "Não foi possível analisar o arquivo",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  return (
    <DataImportContext.Provider
      value={{
        currentImport,
        setCurrentImport,
        uploadFile,
        analyzeFile,
        loading
      }}
    >
      {children}
    </DataImportContext.Provider>
  )
}

export function useDataImport() {
  const context = useContext(DataImportContext)
  if (context === undefined) {
    throw new Error('useDataImport must be used within a DataImportProvider')
  }
  return context
}
