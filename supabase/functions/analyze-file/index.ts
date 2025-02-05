import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const organizationId = formData.get('organizationId')

    if (!file || !organizationId) {
      throw new Error('File and organizationId are required')
    }

    console.log('Processing file:', file.name, 'type:', file.type)

    const arrayBuffer = await file.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)
    
    const workbook = XLSX.read(data, { type: 'array' })
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
    
    if (!firstSheet) {
      throw new Error('No sheet found in the workbook')
    }

    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 })

    if (jsonData.length < 2) {
      throw new Error('File must contain at least a header row and one data row')
    }

    const headers = jsonData[0] as string[]
    const sampleData = jsonData[1] as any[]
    const previewData = jsonData.slice(1, 6)

    console.log('Headers:', headers)
    console.log('Sample data:', sampleData)

    const columns = headers.map((header, index) => {
      const sample = sampleData[index]
      let type = 'text'

      if (typeof sample === 'number') {
        type = Number.isInteger(sample) ? 'integer' : 'numeric'
      } else if (typeof sample === 'boolean') {
        type = 'boolean'
      } else if (sample && !isNaN(Date.parse(sample))) {
        type = 'timestamp'
      }

      return {
        name: header,
        type,
        sample: sample?.toString() || ''
      }
    })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { error: uploadError } = await supabase
      .from('data_imports')
      .insert({
        organization_id: organizationId,
        name: file.name,
        table_name: '',
        original_filename: file.name,
        columns_metadata: { columns },
        status: 'analyzing',
        row_count: jsonData.length - 1
      })

    if (uploadError) {
      console.error('Error saving to data_imports:', uploadError)
      throw uploadError
    }

    return new Response(
      JSON.stringify({
        columns,
        previewData,
        totalRows: jsonData.length - 1
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )
  } catch (error) {
    console.error('Error processing file:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.stack
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }, 
        status: 400 
      }
    )
  }
})