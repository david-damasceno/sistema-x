
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"
import * as XLSX from "https://esm.sh/xlsx@0.18.5"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BATCH_SIZE = 25; // Reduzido para evitar timeout

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { fileId } = await req.json()
    console.log('Iniciando processamento do arquivo:', fileId)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Buscar informações do arquivo
    console.log('Buscando informações do arquivo...')
    const { data: fileData, error: fileError } = await supabaseAdmin
      .from('data_imports')
      .select('*')
      .eq('id', fileId)
      .single()

    if (fileError || !fileData) {
      console.error('Erro ao buscar arquivo:', fileError)
      throw new Error('Arquivo não encontrado')
    }

    console.log('Dados do arquivo encontrados:', {
      id: fileData.id,
      nome: fileData.name,
      caminho: fileData.storage_path
    })

    // Atualizar status para analyzing
    console.log('Atualizando status para analyzing...')
    const { error: updateError } = await supabaseAdmin
      .from('data_imports')
      .update({ status: 'analyzing' })
      .eq('id', fileId)

    if (updateError) {
      console.error('Erro ao atualizar status:', updateError)
      throw updateError
    }

    // Baixar o arquivo do storage
    console.log('Baixando arquivo do storage...')
    const { data: fileBuffer, error: downloadError } = await supabaseAdmin
      .storage
      .from('data_files')
      .download(fileData.storage_path)

    if (downloadError) {
      console.error('Erro ao baixar arquivo:', downloadError)
      await handleError(supabaseAdmin, fileId, 'Erro ao baixar arquivo: ' + downloadError.message)
      throw downloadError
    }

    console.log('Arquivo baixado com sucesso, convertendo...')

    // Converter para array buffer
    let arrayBuffer;
    try {
      arrayBuffer = await fileBuffer.arrayBuffer()
      console.log('Buffer criado com sucesso, tamanho:', arrayBuffer.byteLength)
    } catch (error) {
      console.error('Erro ao converter arquivo:', error)
      await handleError(supabaseAdmin, fileId, 'Erro ao converter arquivo')
      throw error
    }

    // Ler o arquivo Excel
    console.log('Lendo arquivo Excel...')
    let workbook;
    try {
      workbook = XLSX.read(new Uint8Array(arrayBuffer), { 
        type: 'array',
        cellDates: true,
        cellNF: false,
        cellText: false,
        WTF: true // Modo debug do XLSX
      })
      console.log('Arquivo Excel lido com sucesso')
    } catch (error) {
      console.error('Erro ao ler arquivo Excel:', error)
      await handleError(supabaseAdmin, fileId, 'Erro ao ler arquivo Excel')
      throw error
    }

    // Verificar se há planilhas
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('Arquivo Excel não contém planilhas')
    }

    console.log('Planilhas encontradas:', workbook.SheetNames)
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    
    // Converter para JSON
    console.log('Convertendo para JSON...')
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      dateNF: 'yyyy-mm-dd',
      defval: null
    })

    console.log('Dados convertidos:', { 
      totalLinhas: jsonData.length,
      primeirasLinhas: jsonData.slice(0, 2)
    })

    if (jsonData.length === 0) {
      await handleError(supabaseAdmin, fileId, 'Arquivo está vazio')
      throw new Error('Arquivo está vazio')
    }

    // Analisar colunas
    const columns = Object.keys(jsonData[0] || {})
    console.log('Colunas encontradas:', columns)
    const sampleData = jsonData.slice(0, 5)

    // Processar colunas em lotes menores
    console.log('Processando colunas em lotes...')
    for (let i = 0; i < columns.length; i += BATCH_SIZE) {
      const columnBatch = columns.slice(i, i + BATCH_SIZE)
      console.log(`Processando lote ${i/BATCH_SIZE + 1}, colunas:`, columnBatch)
      
      const columnsData = columnBatch.map(column => ({
        file_id: fileId,
        organization_id: fileData.organization_id,
        original_name: column,
        sample_data: JSON.stringify(sampleData.map(row => row[column])),
      }))

      const { error: batchError } = await supabaseAdmin
        .from('data_file_columns')
        .insert(columnsData)

      if (batchError) {
        console.error('Erro ao criar lote de colunas:', batchError)
        await handleError(supabaseAdmin, fileId, 'Erro ao processar colunas: ' + batchError.message)
        throw batchError
      }

      console.log(`Lote ${i/BATCH_SIZE + 1} processado com sucesso`)
    }

    // Atualizar status final
    console.log('Atualizando status final...')
    const { error: finalUpdateError } = await supabaseAdmin
      .from('data_imports')
      .update({
        status: 'editing',
        row_count: jsonData.length,
      })
      .eq('id', fileId)

    if (finalUpdateError) {
      console.error('Erro ao atualizar status final:', finalUpdateError)
      throw finalUpdateError
    }

    console.log('Processamento concluído com sucesso')
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Arquivo processado com sucesso',
        totalRows: jsonData.length,
        totalColumns: columns.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Erro ao processar arquivo:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})

// Função auxiliar para tratamento de erros
async function handleError(supabase: any, fileId: string, errorMessage: string) {
  console.error('Registrando erro:', errorMessage)
  await supabase
    .from('data_imports')
    .update({ 
      status: 'error',
      error_message: errorMessage
    })
    .eq('id', fileId)
}
