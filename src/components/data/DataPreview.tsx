import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/components/ui/use-toast"
import { supabase } from "@/integrations/supabase/client"
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"

interface Column {
  name: string
  type: string
  sample: any
}

interface DataPreviewProps {
  columns: Column[]
  previewData: any[]
  fileId: string
  onNext: () => void
}

export function DataPreview({ columns, previewData, fileId, onNext }: DataPreviewProps) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [totalRows, setTotalRows] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const rowsPerPage = 50
  const { toast } = useToast()
  const { currentOrganization } = useAuth()

  const fetchData = async () => {
    try {
      setLoading(true)

      const { data: fileData, error } = await supabase.functions.invoke('read-file-data', {
        body: { fileId, page, pageSize: rowsPerPage }
      })

      if (error) throw error

      setData(fileData.data)
      setTotalRows(fileData.totalRows)
      setTotalPages(fileData.totalPages)

    } catch (error: any) {
      console.error('Erro ao buscar dados:', error)
      toast({
        title: "Erro",
        description: "Não foi possível carregar os dados do arquivo.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [page, fileId])

  const handleSave = async (rowIndex: number, columnName: string, value: string) => {
    if (!currentOrganization) {
      toast({
        title: "Erro",
        description: "Organização não encontrada",
        variant: "destructive"
      })
      return
    }

    try {
      // Atualizar dados locais
      const newData = [...data]
      newData[rowIndex] = {
        ...newData[rowIndex],
        [columnName]: value
      }
      setData(newData)

      const { error } = await supabase
        .from('data_file_changes')
        .insert({
          file_id: fileId,
          row_id: rowIndex.toString(),
          column_name: columnName,
          old_value: data[rowIndex][columnName],
          new_value: value,
          organization_id: currentOrganization.id
        })

      if (error) throw error

      toast({
        title: "Sucesso",
        description: "Dados atualizados com sucesso.",
      })
    } catch (error: any) {
      console.error('Erro ao salvar:', error)
      toast({
        title: "Erro",
        description: "Não foi possível salvar as alterações.",
        variant: "destructive"
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-medium">Editor de Dados</h2>
          <p className="text-sm text-muted-foreground">
            Edite os dados importados antes de continuar
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={onNext}>Continuar</Button>
        </div>
      </div>

      <Card>
        <ScrollArea className="h-[600px] rounded-md border">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="p-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px] text-center">#</TableHead>
                    {data.length > 0 && Object.keys(data[0]).map((columnName) => (
                      <TableHead key={columnName} className="min-w-[200px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{columnName}</span>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                      <TableCell className="text-center text-muted-foreground">
                        {(page - 1) * rowsPerPage + rowIndex + 1}
                      </TableCell>
                      {Object.entries(row).map(([columnName, value]) => (
                        <TableCell key={`${rowIndex}-${columnName}`} className="p-0">
                          <Input
                            className="h-8 px-2 border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                            value={value === null ? '' : String(value)}
                            onChange={(e) => {
                              const newData = [...data]
                              newData[rowIndex][columnName] = e.target.value
                              setData(newData)
                            }}
                            onBlur={(e) => handleSave(rowIndex, columnName, e.target.value)}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </ScrollArea>

        <div className="flex items-center justify-between px-4 py-4 border-t">
          <div className="text-sm text-muted-foreground">
            {totalRows} linhas no total
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm">
              Página {page} de {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
