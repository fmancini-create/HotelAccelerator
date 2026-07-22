"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2, XCircle, Loader2, Play, AlertTriangle, ExternalLink, Copy, Check, RefreshCw } from "lucide-react"

const EXEC_SQL_FUNCTION_CODE = `DROP FUNCTION IF EXISTS public.exec_sql(text);

CREATE OR REPLACE FUNCTION public.exec_sql(sql_query TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql_query;
  RETURN 'OK';
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'ERROR: ' || SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.exec_sql(TEXT) TO service_role;

COMMENT ON FUNCTION public.exec_sql IS 'Executes arbitrary SQL statements. Used by migration scripts.';`

const AVAILABLE_SCRIPTS = [
  {
    name: "009_create_pms_integrations_table.sql",
    path: "scripts/009_create_pms_integrations_table.sql",
    description: "⚠️ ESEGUI PER PRIMO: Crea la tabella pms_integrations (necessaria per gli altri script)",
  },
  {
    name: "000_setup_unified.sql",
    path: "scripts/000_setup_unified.sql",
    description: "Setup completo: crea schema connectors, tabelle raw Scidoo, tabelle ETL",
  },
  {
    name: "002_add_organizations_type.sql",
    path: "scripts/002_add_organizations_type.sql",
    description: "Aggiunge colonna 'type' alla tabella organizations",
  },
  {
    name: "008_create_etl_and_missing_tables.sql",
    path: "scripts/008_create_etl_and_missing_tables.sql",
    description: "Crea tabelle ETL (etl_jobs, etl_errors) e tabelle aggregate (bookings_full, daily_rates)",
  },
  {
    name: "fix-availability-mapping.sql",
    path: "scripts/fix-availability-mapping.sql",
    description: "Query diagnostiche per verificare e risolvere problemi di mapping disponibilità",
  },
]

export default function SqlExecutorPage() {
  const [executing, setExecuting] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, any>>({})
  const [copied, setCopied] = useState(false)
  const [functionExists, setFunctionExists] = useState<boolean | null>(null)
  const [checkingFunction, setCheckingFunction] = useState(false)

  useEffect(() => {
    checkExecSqlFunction()
  }, [])

  const checkExecSqlFunction = async () => {
    setCheckingFunction(true)
    try {
      const response = await fetch("/api/admin/check-exec-sql")
      const data = await response.json()
      setFunctionExists(data.exists)
    } catch (error) {
      console.error("[v0] Error checking exec_sql function:", error)
      setFunctionExists(false)
    } finally {
      setCheckingFunction(false)
    }
  }

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(EXEC_SQL_FUNCTION_CODE)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const executeScript = async (scriptPath: string) => {
    setExecuting(scriptPath)
    setResults((prev) => ({ ...prev, [scriptPath]: null }))

    try {
      const response = await fetch("/api/admin/execute-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scriptPath }),
      })

      const data = await response.json()
      setResults((prev) => ({ ...prev, [scriptPath]: data }))
    } catch (error: any) {
      setResults((prev) => ({
        ...prev,
        [scriptPath]: {
          success: false,
          error: error.message || "Failed to execute script",
        },
      }))
    } finally {
      setExecuting(null)
    }
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">SQL Script Executor</h1>
        <p className="text-muted-foreground">Esegui gli script SQL del database. Solo per Super Admin.</p>
      </div>

      <Card
        className={`mb-6 ${functionExists === false ? "border-red-500 bg-red-50" : functionExists === true ? "border-green-500 bg-green-50" : "border-yellow-500 bg-yellow-50"}`}
      >
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1">
              {functionExists === false ? (
                <XCircle className="h-6 w-6 text-red-600 mt-1 flex-shrink-0" />
              ) : functionExists === true ? (
                <CheckCircle2 className="h-6 w-6 text-green-600 mt-1 flex-shrink-0" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-yellow-600 mt-1 flex-shrink-0" />
              )}
              <div className="flex-1">
                <CardTitle
                  className={
                    functionExists === false
                      ? "text-red-900"
                      : functionExists === true
                        ? "text-green-900"
                        : "text-yellow-900"
                  }
                >
                  {functionExists === false
                    ? "Setup Richiesto"
                    : functionExists === true
                      ? "Setup Completato!"
                      : "Verifica Setup"}
                </CardTitle>
                <CardDescription
                  className={`mt-2 ${functionExists === false ? "text-red-700" : functionExists === true ? "text-green-700" : "text-yellow-700"}`}
                >
                  {functionExists === false ? (
                    <>
                      La funzione <code className="bg-red-100 px-1 rounded font-mono">exec_sql</code> non esiste ancora
                      nel database. Segui le istruzioni qui sotto.
                    </>
                  ) : functionExists === true ? (
                    <>
                      La funzione <code className="bg-green-100 px-1 rounded font-mono">exec_sql</code> è configurata
                      correttamente. Puoi eseguire gli script.
                    </>
                  ) : (
                    "Verifica se il setup è stato completato..."
                  )}
                </CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={checkExecSqlFunction} disabled={checkingFunction}>
              {checkingFunction ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifica...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Verifica
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        {functionExists === false && (
          <CardContent className="space-y-4">
            <div className="bg-white p-4 rounded-lg border border-red-200">
              <h3 className="font-semibold text-red-900 mb-3">Procedura (da fare UNA SOLA VOLTA):</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-red-800">
                <li>
                  Apri il tuo progetto Supabase → <strong>SQL Editor</strong>
                  <Button
                    variant="link"
                    size="sm"
                    className="ml-2 h-auto p-0 text-red-600"
                    onClick={() => window.open("https://supabase.com/dashboard/project/_/sql", "_blank")}
                  >
                    Apri SQL Editor <ExternalLink className="ml-1 h-3 w-3" />
                  </Button>
                </li>
                <li>Copia il codice SQL qui sotto (clicca il pulsante "Copia")</li>
                <li>Incollalo nel SQL Editor di Supabase</li>
                <li>
                  Clicca <strong>"Run"</strong> per eseguirlo
                </li>
                <li>Torna qui e clicca "Verifica" per confermare che il setup è completo</li>
              </ol>
            </div>

            <div className="relative">
              <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-xs font-mono">
                {EXEC_SQL_FUNCTION_CODE}
              </pre>
              <Button size="sm" variant="secondary" className="absolute top-2 right-2" onClick={copyToClipboard}>
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Copiato!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copia
                  </>
                )}
              </Button>
            </div>

            <Alert className="bg-yellow-50 border-yellow-300">
              <AlertDescription className="text-yellow-800 text-sm">
                <strong>Perché è necessario?</strong> L'interfaccia web usa la funzione <code>exec_sql</code> per
                eseguire gli script SQL. Ma per creare questa funzione, dobbiamo usare il SQL Editor di Supabase
                direttamente (problema "uovo e gallina").
              </AlertDescription>
            </Alert>
          </CardContent>
        )}
      </Card>

      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-3">Script Disponibili</h2>
        <p className="text-sm text-muted-foreground">
          {functionExists === false
            ? "Completa il setup sopra per abilitare l'esecuzione degli script."
            : "Esegui questi script per configurare il database."}
        </p>
      </div>

      <div className="space-y-4">
        {AVAILABLE_SCRIPTS.map((script) => {
          const result = results[script.path]
          const isExecuting = executing === script.path
          const isDisabled = isExecuting || functionExists !== true

          return (
            <Card key={script.path} className={functionExists === false ? "opacity-60" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg font-mono">{script.name}</CardTitle>
                    <CardDescription className="mt-1">{script.description}</CardDescription>
                  </div>
                  <Button onClick={() => executeScript(script.path)} disabled={isDisabled} size="sm" className="ml-4">
                    {isExecuting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Esecuzione...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Esegui
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>

              {result && (
                <CardContent>
                  {result.success ? (
                    <Alert className="border-green-500 bg-green-50">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-800">
                        {result.message}
                        {result.successes && result.successes.length > 0 && (
                          <div className="mt-2 text-sm">
                            <strong>Statements eseguiti:</strong> {result.successes.length}
                          </div>
                        )}
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert variant="destructive">
                      <XCircle className="h-4 w-4" />
                      <AlertDescription>
                        {result.message || result.error}
                        {result.errors && result.errors.length > 0 && (
                          <div className="mt-2 text-sm space-y-1">
                            <strong>Errori:</strong>
                            {result.errors.slice(0, 3).map((err: string, idx: number) => (
                              <div key={idx} className="font-mono text-xs bg-red-100 p-2 rounded">
                                {err}
                              </div>
                            ))}
                            {result.errors.length > 3 && (
                              <div className="text-xs text-red-600">... e altri {result.errors.length - 3} errori</div>
                            )}
                          </div>
                        )}
                        {result.successes && result.successes.length > 0 && (
                          <div className="mt-2 text-sm">
                            <strong>Statements riusciti:</strong> {result.successes.length}
                          </div>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      <Alert className="mt-8">
        <AlertDescription>
          <strong>Nota:</strong> Questi script modificano il database. Assicurati di sapere cosa stai facendo prima di
          eseguirli. Alcuni script sono idempotenti (possono essere eseguiti più volte senza problemi), altri no.
        </AlertDescription>
      </Alert>
    </div>
  )
}
