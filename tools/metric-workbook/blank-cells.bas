' Clear input cells in a copy of a Statutory Biodiversity Metric workbook,
' recalculate it and save it as .xlsx. LibreOffice Basic, run headless by
' scenario.js (installed into a throwaway profile); not run directly.
'
' Reads a spec file named by the METRIC_SCENARIO_SPEC environment variable:
'   line 1  source workbook path
'   line 2  output .xlsx path
'   line 3  sheet name
'   line 4  reference column index (0-based)
'   then    one line per parcel: REF|col|col|...  (0-based column indexes)
' and writes a log beside it (<spec>.log). Lines starting "ERROR:" mean the
' run stopped. Only plain input cells are cleared: a formula cell is an error,
' so a template change can't silently break the metric's calculations.

Sub Run
  Dim spec As String, logPath As String
  spec = Environ("METRIC_SCENARIO_SPEC")
  logPath = spec & ".log"
  Dim lg As Integer : lg = FreeFile
  Open logPath For Output As #lg

  Dim f As Integer : f = FreeFile
  Open spec For Input As #f
  Dim src As String, outp As String, sheetName As String, refColText As String
  Line Input #f, src
  Line Input #f, outp
  Line Input #f, sheetName
  Line Input #f, refColText

  Dim loadArgs(0) As New com.sun.star.beans.PropertyValue
  loadArgs(0).Name = "Hidden"
  loadArgs(0).Value = True
  Dim doc As Object
  doc = StarDesktop.loadComponentFromURL(ConvertToURL(src), "_blank", 0, loadArgs())
  Dim sh As Object
  sh = doc.Sheets.getByName(sheetName)
  Dim refCol As Integer : refCol = CInt(refColText)

  Dim ln As String, parts, r As Long, found As Long, i As Integer, c As Object
  Do While Not EOF(f)
    Line Input #f, ln
    If Len(Trim(ln)) > 0 Then
      parts = Split(ln, "|")
      found = -1
      For r = 0 To 999
        If Trim(sh.getCellByPosition(refCol, r).getString()) = parts(0) Then
          found = r
          Exit For
        End If
      Next r
      If found = -1 Then
        Print #lg, "ERROR: reference " & parts(0) & " not found on " & sheetName
        GoTo Finish
      End If
      For i = 1 To UBound(parts)
        c = sh.getCellByPosition(CInt(parts(i)), found)
        If Left(c.getFormula(), 1) = "=" Then
          Print #lg, "ERROR: " & parts(0) & " column " & parts(i) & " is a formula, not an input - refusing to clear it"
          GoTo Finish
        End If
        Print #lg, parts(0) & " row " & (found + 1) & " column " & parts(i) & ": cleared '" & c.getString() & "'"
        ' com.sun.star.sheet.CellFlags VALUE | DATETIME | STRING: keeps the
        ' cell's formatting and drop-down validation.
        c.clearContents(7)
      Next i
    End If
  Loop

  doc.calculateAll()
  Dim saveArgs(0) As New com.sun.star.beans.PropertyValue
  saveArgs(0).Name = "FilterName"
  saveArgs(0).Value = "Calc Office Open XML"
  doc.storeToURL(ConvertToURL(outp), saveArgs())
  Print #lg, "SAVED: " & outp

Finish:
  Close #f
  Close #lg
  doc.close(True)
  StarDesktop.terminate()
End Sub
