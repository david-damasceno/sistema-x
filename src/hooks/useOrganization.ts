import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/integrations/supabase/client"
import { Database } from "@/integrations/supabase/types"

type Organization = Database['public']['Tables']['organizations']['Row']
type OrganizationMember = Database['public']['Tables']['organization_members']['Row']

export function useOrganization() {
  const [loading, setLoading] = useState(false)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null)
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const { toast } = useToast()

  const fetchOrganizations = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('organizations')
        .select('*')

      if (error) throw error

      setOrganizations(data || [])
      
      if (data && data.length > 0) {
        setCurrentOrganization(data[0])
      }
    } catch (error: any) {
      console.error('Error fetching organizations:', error)
      toast({
        title: "Erro",
        description: "Não foi possível carregar as organizações.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const generateUniqueSlug = async (baseSlug: string): Promise<string> => {
    let slug = baseSlug
    let counter = 1
    let isUnique = false

    while (!isUnique) {
      const { data, error } = await supabase
        .from('organizations')
        .select('slug')
        .eq('slug', slug)
        .single()

      if (error && error.code === 'PGRST116') {
        // Nenhum resultado encontrado, slug é único
        isUnique = true
      } else if (!error) {
        // Slug existe, tentar próximo número
        slug = `${baseSlug}-${counter}`
        counter++
      } else {
        throw error
      }
    }

    return slug
  }

  const createOrganization = async (name: string) => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        throw new Error('Usuário não autenticado')
      }

      const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      const uniqueSlug = await generateUniqueSlug(baseSlug)

      const { data: result, error: rpcError } = await supabase.rpc(
        'create_organization_with_owner',
        {
          p_name: name,
          p_slug: uniqueSlug,
          p_user_id: user.id
        }
      )

      if (rpcError) throw rpcError

      if (!result) throw new Error('Nenhum resultado retornado da função RPC')

      toast({
        title: "Sucesso",
        description: "Organização criada com sucesso.",
      })

      await fetchOrganizations()
      return result as Organization
    } catch (error: any) {
      console.error('Error creating organization:', error)
      toast({
        title: "Erro",
        description: "Não foi possível criar a organização.",
        variant: "destructive"
      })
      throw error
    } finally {
      setLoading(false)
    }
  }

  const fetchMembers = async (organizationId: string) => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('organization_members')
        .select('*')
        .eq('organization_id', organizationId)

      if (error) throw error

      setMembers(data || [])
    } catch (error: any) {
      console.error('Error fetching members:', error)
      toast({
        title: "Erro",
        description: "Não foi possível carregar os membros da organização.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const inviteMember = async (organizationId: string, email: string, role: 'member' | 'admin') => {
    try {
      setLoading(true)
      const token = crypto.randomUUID()
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7) // Convite expira em 7 dias

      const { error } = await supabase
        .from('organization_invites')
        .insert({
          organization_id: organizationId,
          email,
          role,
          token,
          invited_by: (await supabase.auth.getUser()).data.user?.id,
          expires_at: expiresAt.toISOString()
        })

      if (error) throw error

      toast({
        title: "Sucesso",
        description: "Convite enviado com sucesso.",
      })
    } catch (error: any) {
      console.error('Error inviting member:', error)
      toast({
        title: "Erro",
        description: "Não foi possível enviar o convite.",
        variant: "destructive"
      })
      throw error
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrganizations()
  }, [])

  useEffect(() => {
    if (currentOrganization) {
      fetchMembers(currentOrganization.id)
    }
  }, [currentOrganization])

  return {
    loading,
    organizations,
    currentOrganization,
    setCurrentOrganization,
    members,
    createOrganization,
    inviteMember
  }
}