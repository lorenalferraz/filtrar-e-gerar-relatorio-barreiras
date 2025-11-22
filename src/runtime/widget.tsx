/* eslint-disable no-prototype-builtins */
/** @jsx jsx */
/**
  Licensing

  Copyright 2022 Esri

  Licensed under the Apache License, Version 2.0 (the "License"); You
  may not use this file except in compliance with the License. You may
  obtain a copy of the License at
  http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
  implied. See the License for the specific language governing
  permissions and limitations under the License.

  A copy of the license is available in the repository's
  LICENSE file.
*/
import { React, type AllWidgetProps, css, jsx } from 'jimu-core'
import {
  loadArcGISJSAPIModules,
  JimuMapViewComponent,
  type JimuMapView
} from 'jimu-arcgis'

import type { IMConfig } from '../config'

import defaultMessages from './translations/default'

// Importa JSZip diretamente para evitar problemas com code splitting
import JSZip from 'jszip'

interface IState {
  jimuMapView: JimuMapView
  loading: boolean
  progress: number // Porcentagem de progresso (0-100)
  quantidadeIDEA: number
  ideaValues: string[]
  shapefileFile: File | null
  shapefileLayer: __esri.FeatureLayer | null // Camada do shapefile adicionada ao mapa
  shapefileGeometry: __esri.Polygon | null // Geometria extraída do shapefile
  drawnGeometry: __esri.Geometry | null
  sketchViewModel: __esri.SketchViewModel | null
  graphicsLayer: __esri.GraphicsLayer | null
  analysisResult: {
    sufficient: boolean
    message: string
  } | null
  reportUrl: string | null
  drawingMode: boolean
  jobId: string | null
}

export default class Widget extends React.PureComponent<
AllWidgetProps<IMConfig>,
IState
> {
  // Give types to the modules we import from the ArcGIS API for JavaScript
  SketchViewModel: typeof __esri.SketchViewModel
  GraphicsLayer: typeof __esri.GraphicsLayer
  Polygon: typeof __esri.Polygon
  FeatureLayer: typeof __esri.FeatureLayer

  state: IState = {
    jimuMapView: null,
    loading: false,
    progress: 0,
    quantidadeIDEA: 1,
    ideaValues: [''],
    shapefileFile: null,
    shapefileLayer: null,
    shapefileGeometry: null,
    drawnGeometry: null,
    sketchViewModel: null,
    graphicsLayer: null,
    analysisResult: null,
    reportUrl: null,
    drawingMode: false,
    jobId: null
  }

  // URL da ferramenta de geoprocessamento de calculadora de compensação (regional Barreiras)
  readonly GP_SERVICE_URL = 'https://meioambiente.sistemas.mpba.mp.br/server/rest/services/testeoutput/calculadora_barreiras/GPServer'
  
  // URL do Portal/Server
  readonly PORTAL_URL = 'https://meioambiente.sistemas.mpba.mp.br/server'
  
  // Nome da task específica dentro da GP
  readonly GP_TASK_NAME = 'Simular Área de Compensação'
  
  // Token fornecido para autenticação
  readonly GP_TOKEN = '_zND49dKhvn59tDT4Hq480F8IoVNvwFrgpJRWjyHRBGr8bYaKL_YyzRAy8fWCF-vKaBvjXhH2FuL6OQ0tSffAHebaQBFMN1CpOovsy8fz7U7o9BAvHRXTxi-p6QgvQqB'
  
  // Client Secret para autenticação OAuth2 (quando necessário renovar token)
  readonly CLIENT_SECRET = 'f8c423423aa7446b8a17b30143f9b08a'

  componentDidUpdate = (prevProps, prevState) => {
    if (this.state.jimuMapView && !prevState.jimuMapView) {
      this.initializeSketch()
    }
  }

  componentWillUnmount = () => {
    if (this.state.sketchViewModel) {
      this.state.sketchViewModel.destroy()
    }
  }

  // Inicializa o Sketch para desenho no mapa
  initializeSketch = async () => {
    if (!this.state.jimuMapView || !this.state.jimuMapView.view) {
      return
    }

    try {
      const modules = await loadArcGISJSAPIModules([
        'esri/widgets/Sketch/SketchViewModel',
        'esri/layers/GraphicsLayer',
        'esri/geometry/Polygon'
      ])
      
      const [SketchViewModel, GraphicsLayer, Polygon] = modules
      this.SketchViewModel = SketchViewModel
      this.GraphicsLayer = GraphicsLayer
      this.Polygon = Polygon

      // Cria uma camada de gráficos para o desenho
      const graphicsLayer = new this.GraphicsLayer()
      this.state.jimuMapView.view.map.add(graphicsLayer)

      // Cria o SketchViewModel
      const sketchViewModel = new this.SketchViewModel({
        view: this.state.jimuMapView.view,
        layer: graphicsLayer,
        polygonSymbol: {
          type: 'simple-fill',
          color: [51, 51, 204, 0.2],
          outline: {
            color: [51, 51, 204, 1],
            width: 2
          }
        }
      })

      // Listener para quando o desenho é completado
      sketchViewModel.on('create', (event) => {
        if (event.state === 'complete') {
          const geometry = event.graphic.geometry
          
          // Valida se a geometria tem rings válidos (para polígonos)
          if (geometry && geometry.type === 'polygon') {
            const polygon = geometry as __esri.Polygon
            if (polygon.rings && polygon.rings.length > 0 && polygon.rings[0].length >= 3) {
              console.log('=== GEOMETRIA CAPTURADA ===')
              console.log('Tipo:', geometry.type)
              console.log('SpatialReference:', geometry.spatialReference)
              console.log('Número de rings:', polygon.rings.length)
              
              // Mostra as coordenadas de cada ring
              polygon.rings.forEach((ring, ringIndex) => {
                console.log(`--- Ring ${ringIndex + 1} (${ring.length} pontos) ---`)
                ring.forEach((point, pointIndex) => {
                  console.log(`  Ponto ${pointIndex + 1}: [${point[0]}, ${point[1]}]`)
                })
              })
              
              // Calcula e mostra a área aproximada (se possível)
              try {
                const extent = geometry.extent
                if (extent) {
                  const width = extent.width
                  const height = extent.height
                  console.log('Extent (bounding box):')
                  console.log(`  Xmin: ${extent.xmin}, Ymin: ${extent.ymin}`)
                  console.log(`  Xmax: ${extent.xmax}, Ymax: ${extent.ymax}`)
                  console.log(`  Largura: ${width}, Altura: ${height}`)
                }
              } catch (e) {
                console.log('Não foi possível calcular extent')
              }
              
              this.setState({
                drawnGeometry: geometry,
                drawingMode: false
              })
              // Não precisa resetar - o SketchViewModel já está pronto para um novo desenho
            } else {
              alert('Por favor, desenhe um polígono válido com pelo menos 3 pontos.')
              // Cancela o desenho inválido
              if (sketchViewModel.state !== 'ready') {
                sketchViewModel.cancel()
              }
            }
          } else {
            this.setState({
              drawnGeometry: geometry,
              drawingMode: false
            })
            // Não precisa resetar - o SketchViewModel já está pronto para um novo desenho
          }
        }
      })

      this.setState({
        sketchViewModel,
        graphicsLayer
      })
    } catch (error) {
      console.error('Erro ao inicializar Sketch:', error)
    }
  }

  // Atualiza a quantidade de IDEA e cria os campos dinâmicos
  handleQuantidadeIDEAChange = (event) => {
    const quantidade = parseInt(event.target.value) || 1
    const maxQuantidade = Math.max(1, Math.min(quantidade, 10)) // Limita entre 1 e 10
    
    const ideaValues = []
    for (let i = 0; i < maxQuantidade; i++) {
      ideaValues.push(this.state.ideaValues[i] || '')
    }

    this.setState({
      quantidadeIDEA: maxQuantidade,
      ideaValues
    })
  }

  // Atualiza um valor de IDEA específico
  handleIdeaValueChange = (index: number, value: string) => {
    const ideaValues = [...this.state.ideaValues]
    ideaValues[index] = value
    this.setState({ ideaValues })
  }

  // Valida o shapefile dentro do ZIP
  private async validateShapefileInZip(zipFile: File): Promise<{ valid: boolean; message: string; fileCount?: number }> {
    try {
      // JSZip já está importado no topo do arquivo
      
      console.log('=== VALIDANDO SHAPEFILE NO ZIP ===')
      console.log('Lendo arquivo ZIP:', zipFile.name, 'Tamanho:', zipFile.size, 'bytes')
      
      // Lê o arquivo ZIP
      const zipData = await zipFile.arrayBuffer()
      const zip = await JSZip.loadAsync(zipData)
      
      // Lista todos os arquivos no ZIP
      const fileNames = Object.keys(zip.files)
      console.log('Arquivos encontrados no ZIP:', fileNames)
      
      // Procura pelos arquivos essenciais do shapefile
      const requiredExtensions = ['.shp', '.shx', '.dbf']
      const foundFiles: string[] = []
      const missingFiles: string[] = []
      
      // Procura por arquivos com as extensões necessárias
      requiredExtensions.forEach(ext => {
        const found = fileNames.find(name => name.toLowerCase().endsWith(ext))
        if (found) {
          foundFiles.push(found)
        } else {
          missingFiles.push(ext)
        }
      })
      
      console.log('Arquivos encontrados:', foundFiles)
      console.log('Arquivos faltando:', missingFiles)
      
      // Verifica se tem os arquivos essenciais
      if (missingFiles.length > 0) {
        return {
          valid: false,
          message: `O arquivo ZIP não contém todos os arquivos necessários do shapefile.\n\n` +
            `Arquivos encontrados: ${foundFiles.length > 0 ? foundFiles.join(', ') : 'Nenhum'}\n` +
            `Arquivos faltando: ${missingFiles.join(', ')}\n\n` +
            `Um shapefile completo precisa de:\n` +
            `- .shp (geometria)\n` +
            `- .shx (índice)\n` +
            `- .dbf (atributos)\n` +
            `- .prj (projeção - opcional)`,
          fileCount: fileNames.length
        }
      }
      
      // Tenta ler o arquivo .shp para validar geometrias
      const shpFile = foundFiles.find(f => f.toLowerCase().endsWith('.shp'))
      if (shpFile) {
        try {
          const shpData = await zip.files[shpFile].async('arraybuffer')
          console.log('Arquivo .shp encontrado, tamanho:', shpData.byteLength, 'bytes')
          
          // Validação básica: verifica se o arquivo .shp tem um tamanho mínimo
          // Um shapefile válido precisa ter pelo menos o header (100 bytes) + alguns registros
          if (shpData.byteLength < 100) {
            return {
              valid: false,
              message: 'O arquivo .shp está muito pequeno ou corrompido. Tamanho mínimo esperado: 100 bytes.',
              fileCount: fileNames.length
            }
          }
          
          // Validação básica do shapefile (sem shpjs)
          // shpjs foi removido - usando apenas validação básica do header
          console.log('Fazendo validação básica do arquivo...')
          
          // Validação básica: verifica o header do shapefile
          const view = new DataView(shpData)
          const fileCode = view.getInt32(0, false) // Big endian
          const shapeType = view.getInt32(32, true) // Little endian
          
          // Código de arquivo shapefile válido é 9994
          if (fileCode !== 9994) {
            return {
              valid: false,
              message: 'O arquivo .shp não parece ser um shapefile válido.\n\n' +
                'Código de arquivo esperado: 9994\n' +
                `Código encontrado: ${fileCode}`,
              fileCount: fileNames.length
            }
          }
          
          // ShapeType 5 = Polygon
          if (shapeType !== 5) {
            return {
              valid: false,
              message: `O shapefile não contém polígonos.\n\n` +
                `Tipo de geometria encontrado: ${shapeType}\n` +
                `Tipo esperado: 5 (Polygon)\n\n` +
                `Este widget requer geometrias do tipo Polygon.`,
              fileCount: fileNames.length
            }
          }
          
          return {
            valid: true,
            message: 'Shapefile validado (validação básica). Arquivo parece estar correto.',
            fileCount: fileNames.length
          }
        } catch (readError) {
          console.error('Erro ao ler arquivo .shp:', readError)
          return {
            valid: false,
            message: `Erro ao ler o arquivo .shp: ${readError.message}`,
            fileCount: fileNames.length
          }
        }
      }
      
      return {
        valid: false,
        message: 'Não foi possível encontrar o arquivo .shp no ZIP.',
        fileCount: fileNames.length
      }
    } catch (error) {
      console.error('Erro ao validar shapefile:', error)
      return {
        valid: false,
        message: `Erro ao validar o arquivo ZIP: ${error.message}\n\n` +
          'Por favor, verifique se o arquivo é um ZIP válido contendo um shapefile completo.'
      }
    }
  }

  // Manipula o upload do shapefile
  handleShapefileUpload = async (event) => {
    const file = event.target.files?.[0]
    if (file) {
      if (file.name.toLowerCase().endsWith('.zip')) {
        // Valida o shapefile antes de salvar
        this.setState({ loading: true })
        try {
          const validation = await this.validateShapefileInZip(file)
          
          if (validation.valid) {
            // Lê o shapefile e adiciona como camada local ao mapa
            await this.addShapefileLayerFromZip(file)
            this.setState({ shapefileFile: file, loading: false })
            alert(`✓ ${validation.message}\n\nA camada foi adicionada ao mapa.`)
          } else {
            this.setState({ shapefileFile: null, shapefileLayer: null, shapefileGeometry: null, loading: false })
            alert(`❌ ${validation.message}`)
            // Limpa o input
            event.target.value = ''
          }
        } catch (error) {
          console.error('Erro ao validar shapefile:', error)
          this.setState({ loading: false })
          alert(`Erro ao validar o arquivo: ${error.message}\n\nO arquivo será enviado mesmo assim, mas pode falhar no servidor.`)
          // Tenta adicionar mesmo assim
          try {
            await this.addShapefileLayerFromZip(file)
            this.setState({ shapefileFile: file })
          } catch (addError) {
            console.error('Erro ao adicionar camada:', addError)
            this.setState({ shapefileFile: null, shapefileLayer: null, shapefileGeometry: null })
          }
        }
      } else {
        alert('Por favor, faça upload de um arquivo ZIP contendo o shapefile.')
      }
    }
  }

  // Lê o shapefile do ZIP e adiciona como camada local ao mapa
  private async addShapefileLayerFromZip(zipFile: File): Promise<void> {
    if (!this.state.jimuMapView?.view?.map) {
      throw new Error('O mapa não está carregado. Aguarde o mapa carregar completamente.')
    }

    try {
      console.log('=== LENDO SHAPEFILE E ADICIONANDO CAMADA LOCAL ===')
      
      // Carrega módulos necessários
      const modules = await loadArcGISJSAPIModules([
        'esri/layers/FeatureLayer',
        'esri/geometry/Polygon',
        'esri/Graphic',
        'esri/geometry/SpatialReference',
        'esri/geometry/geometryEngine'
      ])
      const [FeatureLayer, Polygon, Graphic, SpatialReference, geometryEngine] = modules
      this.FeatureLayer = FeatureLayer
      
      // Remove camada anterior se existir
      if (this.state.shapefileLayer && this.state.jimuMapView.view.map) {
        this.state.jimuMapView.view.map.remove(this.state.shapefileLayer)
      }
      
      // Lê o ZIP (JSZip já está importado no topo do arquivo)
      const zipBuffer = await zipFile.arrayBuffer()
      const zip = await JSZip.loadAsync(zipBuffer)
      
      // Encontra arquivos do shapefile
      const fileNames = Object.keys(zip.files)
      const shpFile = fileNames.find(name => name.toLowerCase().endsWith('.shp'))
      const dbfFile = fileNames.find(name => name.toLowerCase().endsWith('.dbf'))
      const prjFile = fileNames.find(name => name.toLowerCase().endsWith('.prj'))
      
      if (!shpFile) {
        throw new Error('Arquivo .shp não encontrado no ZIP')
      }
      
      // Lê o arquivo .shp
      const shpFileObj = zip.file(shpFile)
      if (!shpFileObj) {
        throw new Error('Não foi possível ler o arquivo .shp')
      }
      const shpData = await shpFileObj.async('arraybuffer')
      
      // Lê o arquivo .prj para obter o sistema de coordenadas
      let spatialReference: any = { wkid: 4674 } // Padrão SIRGAS 2000
      let originalWkid: number | null = null
      if (prjFile) {
        try {
          const prjFileObj = zip.file(prjFile)
          if (!prjFileObj) {
            throw new Error('Não foi possível ler o arquivo .prj')
          }
          const prjText = await prjFileObj.async('string')
          console.log('PRJ encontrado:', prjText)
          
          // Extrai WKID do PRJ (suporta vários sistemas)
          // SIRGAS 2000 / 4674
          if (prjText.includes('4674') || prjText.includes('SIRGAS 2000')) {
            spatialReference = { wkid: 4674 }
            originalWkid = 4674
          }
          // WGS84 / 4326
          else if (prjText.includes('4326') || prjText.includes('WGS 84')) {
            spatialReference = { wkid: 4326 }
            originalWkid = 4326
          }
          // Web Mercator / 3857
          else if (prjText.includes('3857') || prjText.includes('Web Mercator')) {
            spatialReference = { wkid: 3857 }
            originalWkid = 3857
          }
          // UTM (diversos fusos)
          else if (prjText.includes('UTM') || prjText.includes('Universal Transverse Mercator')) {
            // Tenta extrair o WKID do UTM do PRJ
            const utmMatch = prjText.match(/AUTHORITY\["EPSG","(\d+)"\]/)
            if (utmMatch) {
              const utmWkid = parseInt(utmMatch[1])
              spatialReference = { wkid: utmWkid }
              originalWkid = utmWkid
              console.log(`WKID UTM detectado: ${utmWkid}`)
            } else {
              // UTM comum no Brasil: 31983 (UTM Zone 23S) ou 31984 (UTM Zone 24S)
              console.warn('UTM detectado mas WKID não encontrado. Assumindo UTM Zone 23S (31983)')
              spatialReference = { wkid: 31983 }
              originalWkid = 31983
            }
          }
          // Tenta extrair WKID diretamente do PRJ
          else {
            const wkidMatch = prjText.match(/AUTHORITY\["EPSG","(\d+)"\]|WKID\s*=\s*(\d+)|EPSG:(\d+)/i)
            if (wkidMatch) {
              const extractedWkid = parseInt(wkidMatch[1] || wkidMatch[2] || wkidMatch[3])
              spatialReference = { wkid: extractedWkid }
              originalWkid = extractedWkid
              console.log(`WKID extraído do PRJ: ${extractedWkid}`)
            }
          }
          
          console.log('SpatialReference detectado:', spatialReference)
        } catch (prjError) {
          console.warn('Erro ao ler PRJ, usando padrão SIRGAS 2000 (4674):', prjError)
        }
      }
      
      // WKID alvo para envio (SIRGAS 2000)
      const targetWkid = 4674
      
      // Faz parsing básico do shapefile (apenas para polígonos simples)
      // NOTA: Este é um parser simplificado - pode não funcionar para todos os shapefiles
      const view = new DataView(shpData)
      const fileCode = view.getInt32(0, false) // Big endian
      
      if (fileCode !== 9994) {
        throw new Error('Arquivo .shp inválido')
      }
      
      // Lê o header
      const fileLength = view.getInt32(24, false) * 2 // Em bytes
      const version = view.getInt32(28, true) // Little endian
      const shapeType = view.getInt32(32, true) // Little endian
      
      if (shapeType !== 5) {
        throw new Error(`Tipo de geometria não suportado: ${shapeType}. Apenas polígonos (tipo 5) são suportados.`)
      }
      
      // Lê o bounding box
      const xMin = view.getFloat64(36, true)
      const yMin = view.getFloat64(44, true)
      const xMax = view.getFloat64(52, true)
      const yMax = view.getFloat64(60, true)
      
      console.log('Bounding box:', { xMin, yMin, xMax, yMax })
      
      // Lê as features (simplificado - apenas primeira feature)
      let offset = 100 // Header tem 100 bytes
      const features: any[] = []
      let extractedGeometry: __esri.Polygon | null = null // Armazena a geometria extraída
      
      while (offset < fileLength - 8) {
        try {
          // Record header
          const recordNumber = view.getInt32(offset, false)
          const contentLength = view.getInt32(offset + 4, false) * 2
          
          if (recordNumber === 0 || contentLength === 0) break
          
          offset += 8
          
          // Shape type
          const recordShapeType = view.getInt32(offset, true)
          if (recordShapeType !== 5) {
            offset += contentLength
            continue
          }
          
          offset += 4
          
          // Bounding box do record
          const recXMin = view.getFloat64(offset, true)
          const recYMin = view.getFloat64(offset + 8, true)
          const recXMax = view.getFloat64(offset + 16, true)
          const recYMax = view.getFloat64(offset + 24, true)
          
          offset += 32
          
          // Número de partes
          const numParts = view.getInt32(offset, true)
          offset += 4
          
          // Número de pontos
          const numPoints = view.getInt32(offset, true)
          offset += 4
          
          if (numPoints === 0) {
            offset += contentLength - 44
            continue
          }
          
          // Lê os índices das partes
          const partIndices: number[] = []
          for (let i = 0; i < numParts; i++) {
            partIndices.push(view.getInt32(offset, true))
            offset += 4
          }
          
          // Lê os pontos
          const rings: number[][][] = []
          console.log(`=== COORDENADAS DO SHAPEFILE ===`)
          console.log(`Número de partes: ${numParts}`)
          console.log(`Número total de pontos: ${numPoints}`)
          
          for (let partIndex = 0; partIndex < numParts; partIndex++) {
            const startIndex = partIndices[partIndex]
            const endIndex = partIndex < numParts - 1 ? partIndices[partIndex + 1] : numPoints
            
            const ring: number[][] = []
            console.log(`--- Ring ${partIndex + 1} (índices ${startIndex} a ${endIndex - 1}) ---`)
            
            for (let i = startIndex; i < endIndex; i++) {
              const x = view.getFloat64(offset, true)
              const y = view.getFloat64(offset + 8, true)
              ring.push([x, y])
              console.log(`  Ponto ${i - startIndex + 1}: [${x.toFixed(6)}, ${y.toFixed(6)}]`)
              offset += 16
            }
            
            // Fecha o ring se necessário
            if (ring.length > 0) {
              const first = ring[0]
              const last = ring[ring.length - 1]
              const isClosed = first[0] === last[0] && first[1] === last[1]
              console.log(`  Ring ${partIndex + 1} está fechado: ${isClosed}`)
              if (!isClosed) {
                ring.push([first[0], first[1]])
                console.log(`  Ring ${partIndex + 1} foi fechado adicionando ponto: [${first[0].toFixed(6)}, ${first[1].toFixed(6)}]`)
              }
              console.log(`  Total de pontos no ring ${partIndex + 1}: ${ring.length}`)
            }
            
            rings.push(ring)
          }
          
          console.log(`--- Resumo das Coordenadas ---`)
          console.log(`Total de rings: ${rings.length}`)
          rings.forEach((ring, index) => {
            console.log(`Ring ${index + 1}: ${ring.length} pontos`)
            if (ring.length > 0) {
              console.log(`  Primeiro ponto: [${ring[0][0].toFixed(6)}, ${ring[0][1].toFixed(6)}]`)
              console.log(`  Último ponto: [${ring[ring.length - 1][0].toFixed(6)}, ${ring[ring.length - 1][1].toFixed(6)}]`)
            }
          })
          
          // Cria a geometria usando Polygon do ArcGIS com a projeção original
          let polygonGeometry = new Polygon({
            rings: rings,
            spatialReference: new SpatialReference(spatialReference)
          })
          
          console.log(`=== GEOMETRIA CRIADA ===`)
          console.log(`Tipo: Polygon`)
          console.log(`SpatialReference original: WKID ${spatialReference.wkid}`)
          console.log(`Número de rings: ${rings.length}`)
          
          // Obtém o extent da geometria original
          const originalExtent = polygonGeometry.extent
          if (originalExtent) {
            console.log(`Extent original:`)
            console.log(`  XMin: ${originalExtent.xmin?.toFixed(6)}`)
            console.log(`  YMin: ${originalExtent.ymin?.toFixed(6)}`)
            console.log(`  XMax: ${originalExtent.xmax?.toFixed(6)}`)
            console.log(`  YMax: ${originalExtent.ymax?.toFixed(6)}`)
          }
          
          // Converte para SIRGAS 2000 (4674) se necessário
          if (spatialReference.wkid !== targetWkid) {
            console.log(`=== CONVERTENDO PROJEÇÃO ===`)
            console.log(`De: WKID ${spatialReference.wkid}`)
            console.log(`Para: WKID ${targetWkid} (SIRGAS 2000)`)
            
            try {
              // Usa geometryEngine para projetar a geometria
              const targetSpatialRef = new SpatialReference({ wkid: targetWkid })
              const projectedGeometry = geometryEngine.project(polygonGeometry, targetSpatialRef) as __esri.Polygon
              
              if (projectedGeometry) {
                polygonGeometry = projectedGeometry
                console.log(`✓ Geometria convertida com sucesso para WKID ${targetWkid}`)
                
                // Mostra o extent após conversão
                const projectedExtent = polygonGeometry.extent
                if (projectedExtent) {
                  console.log(`Extent após conversão:`)
                  console.log(`  XMin: ${projectedExtent.xmin?.toFixed(6)}`)
                  console.log(`  YMin: ${projectedExtent.ymin?.toFixed(6)}`)
                  console.log(`  XMax: ${projectedExtent.xmax?.toFixed(6)}`)
                  console.log(`  YMax: ${projectedExtent.ymax?.toFixed(6)}`)
                }
              } else {
                console.warn('⚠ Conversão retornou null. Usando geometria original.')
              }
            } catch (projectError) {
              console.error('Erro ao converter projeção:', projectError)
              console.warn('⚠ Usando geometria na projeção original. A GP tool pode não aceitar.')
              // Continua com a geometria original
            }
          } else {
            console.log(`✓ Geometria já está em SIRGAS 2000 (4674). Não é necessário converter.`)
          }
          
          // Cria a feature como Graphic
          const graphic = new Graphic({
            geometry: polygonGeometry,
            attributes: {
              OBJECTID: features.length + 1
            }
          })
          
          features.push(graphic)
          console.log(`✓ Feature ${features.length} criada com sucesso`)
          
          // Armazena a geometria extraída para uso posterior
          extractedGeometry = polygonGeometry
          console.log('✓ Geometria do shapefile extraída (WKID:', polygonGeometry.spatialReference?.wkid || 'desconhecido', ')')
          
          // Para simplificar, vamos pegar apenas a primeira feature
          break
          
        } catch (parseError) {
          console.warn('Erro ao fazer parse de uma feature:', parseError)
          break
        }
      }
      
      if (features.length === 0) {
        throw new Error('Nenhuma feature válida encontrada no shapefile')
      }
      
      console.log(`✓ ${features.length} feature(s) extraída(s) do shapefile`)
      
      // Cria a FeatureLayer com source sendo um array de Graphics
      const featureLayer = new this.FeatureLayer({
        source: features,
        title: `Área Proposta - ${zipFile.name.replace('.zip', '')}`,
        fields: [
          {
            name: 'OBJECTID',
            type: 'oid',
            alias: 'OBJECTID'
          }
        ],
        objectIdField: 'OBJECTID',
        geometryType: 'polygon',
        spatialReference: new SpatialReference(spatialReference),
        opacity: 1.0, // Opacidade total para respeitar a transparência do símbolo
        renderer: {
          type: 'simple',
          symbol: {
            type: 'simple-fill',
            color: [255, 255, 0, 0.5], // Amarelo com 50% de transparência (RGBA)
            outline: {
              color: [255, 255, 0, 1], // Amarelo sólido para borda
              width: 2
            }
          }
        }
      })
      
      // Adiciona a camada ao mapa
      this.state.jimuMapView.view.map.add(featureLayer)
      console.log('✓ Camada adicionada ao mapa localmente')
      
      // Função auxiliar para fazer zoom na camada
      const zoomToLayer = async (layer: __esri.FeatureLayer, geometry?: __esri.Polygon) => {
        if (!this.state.jimuMapView?.view) {
          console.warn('View do mapa não disponível para zoom')
          return
        }
        
        try {
          let extent: __esri.Extent | null = null
          
          // Prioridade 1: Usa a geometria extraída diretamente (mais confiável para camadas locais)
          if (geometry && geometry.extent) {
            extent = geometry.extent
            console.log('Extent obtido da geometria extraída')
          }
          
          // Prioridade 2: Usa a geometria da primeira feature
          if (!extent && features.length > 0 && features[0].geometry && features[0].geometry.extent) {
            extent = features[0].geometry.extent
            console.log('Extent obtido da primeira feature')
          }
          
          // Prioridade 3: Tenta usar fullExtent da camada
          if (!extent && layer.fullExtent) {
            extent = layer.fullExtent
            console.log('Extent obtido via fullExtent da camada')
          }
          
          // Prioridade 4: Tenta usar queryExtent() da camada
          if (!extent) {
            try {
              const queryExtentResult = await layer.queryExtent()
              if (queryExtentResult && queryExtentResult.extent) {
                extent = queryExtentResult.extent
                console.log('Extent obtido via queryExtent() da camada')
              }
            } catch (queryError) {
              console.warn('Não foi possível obter extent via queryExtent:', queryError)
            }
          }
          
          if (!extent) {
            console.warn('Extent não disponível para zoom - nenhum método funcionou')
            return
          }
          
          // Verifica se o extent é válido
          if (extent.xmin === null || extent.xmax === null || extent.ymin === null || extent.ymax === null) {
            console.warn('Extent possui valores inválidos (null)')
            return
          }
          
          // Verifica se não é infinito
          if (!isFinite(extent.xmin) || !isFinite(extent.xmax) || !isFinite(extent.ymin) || !isFinite(extent.ymax)) {
            console.warn('Extent possui valores infinitos')
            return
          }
          
          // Verifica se o extent tem área válida (não é um ponto)
          const width = extent.xmax - extent.xmin
          const height = extent.ymax - extent.ymin
          if (width === 0 && height === 0) {
            console.warn('Extent é um ponto único - não é possível fazer zoom')
            return
          }
          
          console.log('Extent válido encontrado:', {
            xmin: extent.xmin,
            ymin: extent.ymin,
            xmax: extent.xmax,
            ymax: extent.ymax,
            width,
            height,
            spatialReference: extent.spatialReference?.wkid
          })
          
          // Cria um novo extent expandido (15% de padding para melhor visualização)
          const padding = 0.15
          const expandedExtent = {
            xmin: extent.xmin - width * padding,
            ymin: extent.ymin - height * padding,
            xmax: extent.xmax + width * padding,
            ymax: extent.ymax + height * padding,
            spatialReference: extent.spatialReference
          }
          
          console.log('Aplicando zoom automático...')
          
          // Obtém a projeção atual do mapa/view
          const viewSpatialRef = this.state.jimuMapView.view.spatialReference
          console.log('Projeção do mapa/view:', viewSpatialRef?.wkid || 'desconhecida')
          console.log('Projeção do extent:', extent.spatialReference?.wkid || 'desconhecida')
          
          // Aguarda um pequeno delay para garantir que a camada foi renderizada
          await new Promise(resolve => setTimeout(resolve, 500))
          
          // Tenta fazer zoom usando a geometria diretamente primeiro (API converte automaticamente)
          // Se tiver geometria disponível, usa ela ao invés do extent
          if (geometry && geometry.type === 'polygon') {
            console.log('Tentando zoom usando geometria diretamente...')
            try {
              await this.state.jimuMapView.view.goTo(geometry, {
                duration: 1000,
                padding: {
                  left: 50,
                  top: 50,
                  right: 50,
                  bottom: 50
                }
              })
              console.log('✓ Zoom automático aplicado usando geometria com sucesso')
              return // Sucesso, sai da função
            } catch (geometryZoomError) {
              console.warn('Erro ao fazer zoom com geometria, tentando com extent:', geometryZoomError)
              // Continua para tentar com extent
            }
          }
          
          // Tenta projetar o extent para a projeção do mapa se necessário
          let extentToUse: any = expandedExtent
          if (extent.spatialReference?.wkid !== viewSpatialRef?.wkid && viewSpatialRef?.wkid) {
            try {
              console.log('Convertendo extent para projeção do mapa...')
              const extentGeometry = new Polygon({
                rings: [
                  [[expandedExtent.xmin, expandedExtent.ymin], [expandedExtent.xmax, expandedExtent.ymin], 
                   [expandedExtent.xmax, expandedExtent.ymax], [expandedExtent.xmin, expandedExtent.ymax], 
                   [expandedExtent.xmin, expandedExtent.ymin]]
                ],
                spatialReference: extent.spatialReference
              })
              
              const targetSpatialRef = new SpatialReference(viewSpatialRef)
              const projectedGeometry = geometryEngine.project(extentGeometry, targetSpatialRef) as __esri.Polygon
              if (projectedGeometry && projectedGeometry.extent) {
                const projectedExtent = projectedGeometry.extent
                extentToUse = {
                  xmin: projectedExtent.xmin - (projectedExtent.xmax - projectedExtent.xmin) * 0.15,
                  ymin: projectedExtent.ymin - (projectedExtent.ymax - projectedExtent.ymin) * 0.15,
                  xmax: projectedExtent.xmax + (projectedExtent.xmax - projectedExtent.xmin) * 0.15,
                  ymax: projectedExtent.ymax + (projectedExtent.ymax - projectedExtent.ymin) * 0.15,
                  spatialReference: targetSpatialRef
                }
                console.log('Extent convertido para projeção do mapa:', viewSpatialRef.wkid)
              }
            } catch (projectError) {
              console.warn('Erro ao projetar extent, usando extent original:', projectError)
            }
          }
          
          // Tenta fazer zoom com o extent
          this.state.jimuMapView.view.goTo(extentToUse, {
            duration: 1000, // Animação suave de 1 segundo
            easing: 'ease-in-out'
          }).then(() => {
            console.log('✓ Zoom automático aplicado à camada com sucesso')
          }).catch((zoomError) => {
            console.warn('Erro ao fazer zoom com extent:', zoomError)
            // Tenta novamente usando geometria se disponível
            if (geometry) {
              setTimeout(() => {
                if (this.state.jimuMapView?.view) {
                  this.state.jimuMapView.view.goTo(geometry, {
                    padding: { left: 50, top: 50, right: 50, bottom: 50 }
                  })
                    .then(() => console.log('✓ Zoom aplicado na segunda tentativa (usando geometria)'))
                    .catch((retryError) => {
                      console.warn('Erro na segunda tentativa de zoom:', retryError)
                      // Última tentativa sem animação e sem padding
                      setTimeout(() => {
                        if (this.state.jimuMapView?.view) {
                          this.state.jimuMapView.view.goTo(geometry)
                            .then(() => console.log('✓ Zoom aplicado na terceira tentativa (sem animação)'))
                            .catch((finalError) => console.error('Erro na terceira tentativa de zoom:', finalError))
                        }
                      }, 500)
                    })
                }
              }, 800)
            } else {
              // Se não tiver geometria, tenta novamente com extent
              setTimeout(() => {
                if (this.state.jimuMapView?.view) {
                  this.state.jimuMapView.view.goTo(extentToUse)
                    .then(() => console.log('✓ Zoom aplicado na segunda tentativa (sem animação)'))
                    .catch((finalError) => console.error('Erro na segunda tentativa de zoom:', finalError))
                }
              }, 800)
            }
          })
        } catch (error) {
          console.error('Erro ao processar zoom:', error)
        }
      }
      
      // Aguarda a camada carregar completamente e faz zoom imediatamente
      featureLayer.when(() => {
        console.log('Camada carregada, preparando zoom automático...')
        const geometry = extractedGeometry || (features.length > 0 ? features[0].geometry as __esri.Polygon : null)
        if (geometry) {
          // Aguarda um pouco para garantir que a camada foi totalmente processada
          setTimeout(() => {
            zoomToLayer(featureLayer, geometry)
          }, 300)
        } else {
          console.warn('Geometria não disponível para zoom imediato')
        }
      }).catch((layerError) => {
        console.error('Erro ao carregar camada:', layerError)
      })
      
      // Escuta o evento layerview-create para garantir que a camada foi renderizada no mapa
      // Este é um evento importante que garante que a camada está visível no mapa
      featureLayer.on('layerview-create', (event) => {
        console.log('LayerView criada, aplicando zoom automático...')
        const geometry = extractedGeometry || (features.length > 0 ? features[0].geometry as __esri.Polygon : null)
        if (geometry) {
          // Aguarda um delay maior para garantir renderização completa no mapa
          setTimeout(() => {
            zoomToLayer(featureLayer, geometry)
          }, 500)
        } else {
          console.warn('Geometria não disponível para zoom após layerview-create')
        }
      })
      
      // Fallback adicional: tenta fazer zoom após um tempo maior caso os outros eventos não funcionem
      setTimeout(() => {
        if (extractedGeometry || (features.length > 0 && features[0].geometry)) {
          const geometry = extractedGeometry || (features.length > 0 ? features[0].geometry as __esri.Polygon : null)
          if (geometry) {
            console.log('Aplicando zoom automático via fallback (timeout)...')
            zoomToLayer(featureLayer, geometry)
          }
        }
      }, 2000)
      
      // Salva a referência da camada e a geometria no estado
      // Usa a geometria extraída ou pega da primeira feature como fallback
      const finalGeometry = extractedGeometry || (features.length > 0 && features[0].geometry as __esri.Polygon) || null
      if (!finalGeometry) {
        console.warn('⚠ Nenhuma geometria encontrada para salvar no estado')
      }
      this.setState({ 
        shapefileLayer: featureLayer,
        shapefileGeometry: finalGeometry
      })
      console.log('✓ Camada e geometria salvas no estado:', {
        hasLayer: !!featureLayer,
        hasGeometry: !!finalGeometry,
        geometryWkid: finalGeometry?.spatialReference?.wkid
      })
      
    } catch (error: any) {
      console.error('Erro ao ler shapefile e adicionar camada:', error)
      throw new Error(`Erro ao processar shapefile: ${error.message}`)
    }
  }

  // Inicia o modo de desenho
  handleStartDrawing = async () => {
    // Verifica se o mapa está disponível
    if (!this.state.jimuMapView || !this.state.jimuMapView.view) {
      alert('Aguarde o mapa carregar completamente.')
      return
    }

    // Se o sketchViewModel não existe, tenta inicializar
    let sketchViewModel = this.state.sketchViewModel
    if (!sketchViewModel) {
      console.log('SketchViewModel não encontrado. Inicializando...')
      try {
        // Chama initializeSketch e aguarda
        await this.initializeSketch()
        
        // Aguarda o React atualizar o estado (pode levar alguns ciclos)
        await new Promise(resolve => setTimeout(resolve, 200))
        
        // Verifica novamente se foi criado
        sketchViewModel = this.state.sketchViewModel
        if (!sketchViewModel) {
          console.warn('SketchViewModel ainda não foi criado após inicialização')
          alert('Aguarde o mapa carregar completamente. Tente novamente em alguns segundos.')
          return
        }
      } catch (error) {
        console.error('Erro ao inicializar SketchViewModel:', error)
        alert('Erro ao inicializar o desenho. Verifique se o mapa está carregado.')
        return
      }
    }

    // Verifica se o view do sketchViewModel está disponível
    if (!sketchViewModel.view) {
      alert('Aguarde o mapa carregar completamente.')
      return
    }

    // Verifica se o sketchViewModel está pronto para desenhar
    if (sketchViewModel.state && sketchViewModel.state !== 'ready') {
      console.log('SketchViewModel não está pronto. Estado:', sketchViewModel.state)
      // Tenta cancelar qualquer operação em andamento
      try {
        sketchViewModel.cancel()
      } catch (e) {
        console.warn('Não foi possível cancelar operação anterior:', e)
      }
    }

    this.setState({ drawingMode: true })
    sketchViewModel.create('polygon')
  }

  // Limpa a análise e reseta os campos
  handleClearAnalysis = () => {
    // Remove os gráficos desenhados no mapa
    if (this.state.graphicsLayer) {
      this.state.graphicsLayer.removeAll()
      console.log('Gráficos removidos do mapa')
    }

    // Cancela qualquer desenho em andamento e limpa o sketchViewModel
    if (this.state.sketchViewModel) {
      // Cancela se houver um desenho em andamento
      if (this.state.sketchViewModel.state !== 'ready') {
        this.state.sketchViewModel.cancel()
      }
      // Garante que o modo de desenho está desativado
      if (this.state.sketchViewModel.view) {
        this.state.sketchViewModel.view.popup = null
      }
      console.log('SketchViewModel limpo - pronto para novo desenho')
    }

    // Remove a camada do shapefile se existir
    if (this.state.shapefileLayer && this.state.jimuMapView?.view?.map) {
      this.state.jimuMapView.view.map.remove(this.state.shapefileLayer)
      console.log('Camada do shapefile removida do mapa')
    }

    // Reseta o estado
    this.setState({
      quantidadeIDEA: 1,
      ideaValues: [''],
      shapefileFile: null,
      shapefileLayer: null,
      shapefileGeometry: null,
      drawnGeometry: null,
      analysisResult: null,
      reportUrl: null,
      drawingMode: false,
      jobId: null,
      loading: false,
      progress: 0
    })

    // Limpa o input de arquivo
    const fileInput = document.getElementById('shapefile-upload') as HTMLInputElement
    if (fileInput) {
      fileInput.value = ''
    }

    console.log('Análise limpa completamente. Pronto para nova análise.')
  }

  // Baixa o relatório
  handleDownloadReport = () => {
    if (this.state.reportUrl) {
      window.open(this.state.reportUrl, '_blank')
          } else {
      alert('Nenhum relatório disponível para download.')
    }
  }

  // Faz upload do shapefile ZIP para o portal e retorna a URL da camada
  // NOTA: Para ArcGIS Server, pode ser necessário usar a API REST diretamente
  private async uploadShapefileToPortal(zipFile: File, token: string): Promise<string> {
    try {
      console.log('=== INICIANDO UPLOAD PARA PORTAL ===')
      console.log('Portal URL:', this.PORTAL_URL)
      console.log('Arquivo:', zipFile.name, 'Tamanho:', zipFile.size, 'bytes')
      
      // Para ArcGIS Server, vamos tentar usar a API REST diretamente
      // Primeiro, tenta usar a API do Portal/Server
      // Se falhar por CORS, vamos usar uma abordagem alternativa
      
      // Opção 1: Tenta usar /sharing/rest/content/upload (Portal API)
      let uploadUrl = `${this.PORTAL_URL}/sharing/rest/content/upload`
      
      console.log('Tentando fazer upload via Portal API...')
      console.log('URL:', uploadUrl)
      
      const uploadFormData = new FormData()
      uploadFormData.append('file', zipFile, zipFile.name)
      uploadFormData.append('f', 'json')
      uploadFormData.append('token', token)
      
      let uploadResponse: Response
      let uploadResult: any
      
      try {
        uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          body: uploadFormData,
          // Não define headers - o browser define automaticamente para FormData
        })
        
        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text()
          console.error('Erro no upload (status):', uploadResponse.status, errorText)
          
          // Se for erro 500 ou CORS, tenta abordagem alternativa
          if (uploadResponse.status === 500 || uploadResponse.status === 0) {
            throw new Error('CORS ou erro de servidor. Tentando abordagem alternativa...')
          }
          
          throw new Error(`Erro ao fazer upload: ${uploadResponse.status} - ${errorText}`)
        }
        
        uploadResult = await uploadResponse.json()
        console.log('Resultado do upload:', uploadResult)
        
        if (uploadResult.error) {
          throw new Error(`Erro no upload: ${uploadResult.error.message || JSON.stringify(uploadResult.error)}`)
        }
      } catch (fetchError: any) {
        // Se falhar por CORS ou outro erro de rede
        if (fetchError.message?.includes('Failed to fetch') || fetchError.message?.includes('CORS')) {
          console.warn('Erro de CORS detectado. O upload direto não é possível devido a restrições CORS.')
          console.warn('Solução: O arquivo ZIP será enviado diretamente para a GP tool.')
          throw new Error('CORS_BLOCKED')
        }
        throw fetchError
      }
      
      const itemId = uploadResult.item?.id || uploadResult.itemId
      if (!itemId) {
        throw new Error('Não foi possível obter o ID do item após o upload')
      }
      
      console.log('Item ID obtido:', itemId)
      
      // Obtém informações do item
      const itemInfoUrl = `${this.PORTAL_URL}/sharing/rest/content/items/${itemId}?f=json&token=${token}`
      
      console.log('Obtendo informações do item...')
      const itemInfoResponse = await fetch(itemInfoUrl)
      
      if (!itemInfoResponse.ok) {
        throw new Error(`Erro ao obter informações do item: ${itemInfoResponse.status}`)
      }
      
      const itemInfo = await itemInfoResponse.json()
      console.log('Informações do item:', itemInfo)
      
      if (itemInfo.error) {
        throw new Error(`Erro ao obter item: ${itemInfo.error.message || JSON.stringify(itemInfo.error)}`)
      }
      
      // Tenta publicar como feature service
      // Para ArcGIS Server, pode precisar do username
      // Vamos tentar sem username primeiro (alguns servidores permitem)
      const publishUrl = `${this.PORTAL_URL}/sharing/rest/content/users/content/publish`
      
      console.log('Publicando como feature service...')
      const publishFormData = new FormData()
      publishFormData.append('itemId', itemId)
      publishFormData.append('filetype', 'shapefile')
      publishFormData.append('f', 'json')
      publishFormData.append('token', token)
      
      const publishResponse = await fetch(publishUrl, {
        method: 'POST',
        body: publishFormData
      })
      
      if (!publishResponse.ok) {
        const errorText = await publishResponse.text()
        console.error('Erro na publicação:', errorText)
        // Se falhar, tenta obter URL do item diretamente
        console.log('Tentando obter URL do item diretamente...')
      } else {
        const publishResult = await publishResponse.json()
        console.log('Resultado da publicação:', publishResult)
        
        if (publishResult.error) {
          console.warn('Erro na publicação, mas continuando...', publishResult.error)
        } else if (publishResult.services && publishResult.services.length > 0) {
          const layerUrl = publishResult.services[0].serviceurl
          console.log('✓ URL da camada obtida da publicação:', layerUrl)
          return layerUrl
        }
      }
      
      // Se não conseguiu publicar, tenta obter URL do item
      if (itemInfo.url) {
        console.log('✓ URL obtida do item:', itemInfo.url)
        return itemInfo.url
      }
      
      // Última tentativa: constrói URL baseada no padrão
      const constructedUrl = `${this.PORTAL_URL}/rest/services/Hosted/${itemId}/FeatureServer/0`
      console.log('⚠ Usando URL construída (pode não funcionar):', constructedUrl)
      return constructedUrl
      
    } catch (error: any) {
      // Se o erro for CORS, retorna null para usar fallback
      if (error.message === 'CORS_BLOCKED') {
        console.warn('Upload bloqueado por CORS. Usando fallback: enviar arquivo diretamente.')
        throw new Error('CORS_BLOCKED')
      }
      
      console.error('Erro completo no upload para portal:', error)
      throw error
    }
  }

  // Função auxiliar para obter token via OAuth2 usando client secret (renovação automática)
  // Esta função gera um novo token automaticamente quando necessário, com validade de 1 ano
  private async getTokenViaOAuth2(): Promise<string | null> {
    try {
      // URL do servidor ArcGIS para obter token
      const serverUrl = 'https://meioambiente.sistemas.mpba.mp.br/server'
      const tokenUrl = `${serverUrl}/tokens/generateToken`
      
      // Para gerar token com client secret
      const params = new URLSearchParams()
      params.append('f', 'json')
      params.append('client', 'referer')
      params.append('referer', window.location.origin)
      params.append('expiration', '525600') // 1 ano (máximo permitido)
      
      if (this.CLIENT_SECRET) {
        params.append('client_secret', this.CLIENT_SECRET)
      }
      
      console.log('Tentando gerar token via OAuth2...')
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        console.warn('Erro ao gerar token via OAuth2:', errorText)
        return null
      }
      
      const result = await response.json()
      
      if (result.error) {
        console.warn('Erro na resposta do token:', result.error)
        return null
      }
      
      if (result.token) {
        console.log('✓ Token gerado com sucesso via OAuth2')
        console.log('Token expira em:', result.expires ? new Date(result.expires).toLocaleString() : 'Não especificado')
        return result.token
      }
      
      return null
    } catch (error) {
      console.error('Erro ao tentar obter token via OAuth2:', error)
      return null
    }
  }

  // Executa a análise usando a GP tool
  handleRunAnalysis = async () => {
    // Validações
    if (this.state.ideaValues.some(val => !val || val.trim() === '')) {
      alert('Por favor, preencha todos os códigos de alerta.')
      return
    }

    if (!this.state.shapefileGeometry && !this.state.drawnGeometry) {
      alert('Por favor, faça upload de um shapefile OU desenhe uma área no mapa.')
      return
    }

    if (this.state.shapefileGeometry && this.state.drawnGeometry) {
      alert('Por favor, escolha apenas UMA opção: upload de shapefile OU desenho no mapa.')
      return
    }
    
    this.setState({ loading: true, progress: 0, analysisResult: null, reportUrl: null, jobId: null })

    try {
      // Carrega módulos necessários
      const identityModules = await loadArcGISJSAPIModules([
        'esri/identity/IdentityManager'
      ])
      const [IdentityManager] = identityModules
      
      // Obtém token - importante para autenticação
      let token: string | null = null
      try {
        // Tenta encontrar credencial existente
        const credential = IdentityManager.findCredential(this.GP_SERVICE_URL)
        if (credential && credential.token) {
          // Verifica se o token não expirou
          const expires = credential.expires
          const now = new Date().getTime()
          if (expires && expires > now) {
          token = credential.token
            console.log('Token encontrado e válido via IdentityManager')
            console.log('Token expira em:', new Date(expires).toLocaleString())
        } else {
            console.warn('Token encontrado mas expirado. Tentando renovar...')
            // Token expirado, tenta renovar
            try {
              await IdentityManager.checkSignInStatus(this.GP_SERVICE_URL)
              const updatedCredential = IdentityManager.findCredential(this.GP_SERVICE_URL)
              if (updatedCredential && updatedCredential.token) {
                token = updatedCredential.token
                console.log('Token renovado com sucesso')
              }
            } catch (renewError) {
              console.warn('Não foi possível renovar token:', renewError)
            }
          }
        } else {
          // Não tem credencial, tenta obter
          const serverInfo = IdentityManager.findServerInfo(this.GP_SERVICE_URL)
          if (serverInfo) {
            console.log('Tentando obter token automaticamente...')
            await IdentityManager.checkSignInStatus(this.GP_SERVICE_URL)
            const updatedCredential = IdentityManager.findCredential(this.GP_SERVICE_URL)
            if (updatedCredential && updatedCredential.token) {
              token = updatedCredential.token
              console.log('Token obtido automaticamente')
            }
          } else {
            console.warn('ServerInfo não encontrado. O servidor pode requerer autenticação manual.')
            // Tenta verificar status mesmo sem serverInfo
            try {
              await IdentityManager.checkSignInStatus(this.GP_SERVICE_URL)
              const newCredential = IdentityManager.findCredential(this.GP_SERVICE_URL)
              if (newCredential && newCredential.token) {
                token = newCredential.token
                console.log('Token gerado com sucesso')
              }
            } catch (signInError) {
              console.warn('Não foi possível gerar token automaticamente:', signInError)
            }
          }
        }
      } catch (tokenError) {
        console.error('Erro ao obter token:', tokenError)
        console.warn('Continuando sem token - pode causar erro de autenticação')
      }
      
      // Se não obteve token via IdentityManager, tenta gerar via OAuth2
      if (!token) {
        console.warn('Token não obtido via IdentityManager. Tentando gerar via OAuth2...')
        token = await this.getTokenViaOAuth2()
      }
      
      // Fallback final: usa o token fornecido apenas se OAuth2 também falhar
      if (!token) {
        console.warn('Token não obtido via OAuth2. Usando token fornecido como fallback...')
        token = this.GP_TOKEN
      } else {
        console.log('✓ Token obtido automaticamente (IdentityManager ou OAuth2)')
      }
      
      if (!token) {
        const errorMsg = 'ATENÇÃO: Nenhum token foi obtido. A requisição pode falhar por falta de autenticação.\n\n' +
          'Por favor, verifique se você está autenticado no servidor ArcGIS e tente novamente.'
        console.error(errorMsg)
        alert(errorMsg)
        this.setState({ loading: false })
        return
      }
      
      console.log('Token a ser usado:', token.substring(0, 30) + '...')
      console.log('Token completo (últimos 30 caracteres):', '...' + token.substring(token.length - 30))
      
      // Validação rápida do token antes de enviar (opcional, pode falhar por CORS)
      try {
        const validateUrl = `${this.GP_SERVICE_URL}?f=json&token=${token}`
        const validateResponse = await fetch(validateUrl, { method: 'GET' })
        const validateResult = await validateResponse.json()
        
        if (validateResult.error) {
          if (validateResult.error.code === 498 || validateResult.error.code === 401) {
            throw new Error('Token inválido ou expirado. Por favor, gere um novo token.')
          }
        } else {
          console.log('✓ Token validado antes do envio')
        }
      } catch (validateError) {
        console.warn('Não foi possível validar token prévio (pode ser CORS):', validateError)
        // Continua mesmo assim - será validado na requisição principal
      }

      const addTokenToUrl = (url) => {
        if (!token) return url
        try {
          const urlObj = new URL(url)
          urlObj.searchParams.set('token', token)
          return urlObj.toString()
        } catch (e) {
          const separator = url.includes('?') ? '&' : '?'
          return `${url}${separator}token=${encodeURIComponent(token)}`
        }
      }
      
      // Busca metadados da GP tool para descobrir nomes exatos dos parâmetros
      // NOTA: Para GET (taskInfo), o token pode ir na URL. Para POST (submitJob), o token vai no body.
      const taskNameEncodedInfo = encodeURIComponent(this.GP_TASK_NAME)
      const taskInfoUrl = `${this.GP_SERVICE_URL}/${taskNameEncodedInfo}?f=json${token ? `&token=${token}` : ''}`
      
      let gpTaskInfo: any = null
      try {
        const infoResponse = await fetch(taskInfoUrl)
        if (infoResponse.ok) {
          gpTaskInfo = await infoResponse.json()
          console.log('Metadados da GP tool:', gpTaskInfo)
        }
      } catch (infoError) {
        console.warn('Não foi possível buscar metadados da GP tool:', infoError)
      }

      // Prepara os parâmetros
      const params: any = {}

      // Parâmetro: Quantidade de IDEA e valores
      // Usa os nomes exatos dos metadados da GP tool
      let quantidadeParamName = 'quantidade_idea'
      let ideaParamPrefix = 'idea_'
      
      if (gpTaskInfo && gpTaskInfo.parameters) {
        // Procura parâmetros relacionados a IDEA nos metadados
        const quantidadeParam = gpTaskInfo.parameters.find((p: any) => 
          p.name && p.name.toLowerCase().includes('quantidade')
        )
        if (quantidadeParam) {
          quantidadeParamName = quantidadeParam.name
          console.log('Parâmetro de quantidade encontrado:', quantidadeParamName)
        }
        
        // Procura parâmetros IDEA (idea_1, idea_2, etc)
        const ideaParams = gpTaskInfo.parameters.filter((p: any) => 
          p.name && p.name.toLowerCase().startsWith('idea_')
        )
        if (ideaParams.length > 0) {
          // Extrai o prefixo do primeiro parâmetro (ex: "idea_1" -> "idea_")
          const firstIdeaParam = ideaParams[0].name
          ideaParamPrefix = firstIdeaParam.substring(0, firstIdeaParam.lastIndexOf('_') + 1)
          console.log('Parâmetros IDEA encontrados:', ideaParams.map((p: any) => p.name))
          console.log('Prefixo dos parâmetros IDEA:', ideaParamPrefix)
        }
      }
      
      // Adiciona quantidade de IDEA
      params[quantidadeParamName] = this.state.quantidadeIDEA.toString()
      
      // Adiciona os valores de IDEA (idea_1, idea_2, etc)
      for (let i = 0; i < this.state.ideaValues.length; i++) {
        params[`${ideaParamPrefix}${i + 1}`] = this.state.ideaValues[i].trim()
      }
      
      console.log('Parâmetros IDEA preparados:', {
        quantidade: params[quantidadeParamName],
        ideas: Object.keys(params).filter(k => k.startsWith(ideaParamPrefix))
      })

      // Parâmetro: Área proposta (shapefile OU geometria - nunca ambos)
      // Usa os nomes exatos dos metadados da GP tool
      let shapefileParamName = 'area_zip'
      let geometryParamName = 'area_desenho'
      
      if (gpTaskInfo && gpTaskInfo.parameters) {
        console.log('Todos os parâmetros da GP tool:', gpTaskInfo.parameters.map((p: any) => ({
          name: p.name,
          dataType: p.dataType,
          displayName: p.displayName
        })))
        
        // Procura parâmetro de shapefile ZIP (GPDataFile) - usado APENAS para upload de ZIP
        const shapefileParam = gpTaskInfo.parameters.find((p: any) => 
          p.dataType === 'GPDataFile' && 
          p.name && 
          (p.name.toLowerCase().includes('zip') || p.name.toLowerCase().includes('shapefile'))
        )
        if (shapefileParam) {
          shapefileParamName = shapefileParam.name
          console.log('✓ Parâmetro para SHAPEFILE ZIP:', shapefileParamName, 'Tipo:', shapefileParam.dataType)
        }
        
        // Procura parâmetro de geometria desenhada (GPFeatureRecordSetLayer) - usado APENAS para sketch
        // IMPORTANTE: Este é um parâmetro DIFERENTE do shapefile
        const geometryParam = gpTaskInfo.parameters.find((p: any) => 
          p.dataType === 'GPFeatureRecordSetLayer' &&
          p.name &&
          !p.name.toLowerCase().includes('zip') &&
          !p.name.toLowerCase().includes('shapefile')
        )
        if (geometryParam) {
          geometryParamName = geometryParam.name
          console.log('✓ Parâmetro para GEOMETRIA DESENHADA:', geometryParamName, 'Tipo:', geometryParam.dataType)
        } else {
          console.warn('⚠ Não foi encontrado parâmetro GPFeatureRecordSetLayer nos metadados')
          console.warn('Usando nome padrão:', geometryParamName)
        }
      }
      
      // IMPORTANTE: Shapefile e geometria são MUTUAMENTE EXCLUSIVOS
      // - Shapefile Layer: extrai geometria da camada e envia como GPFeatureRecordSetLayer
      // - Geometria desenhada: usa parâmetro GPFeatureRecordSetLayer (outro nome)
      
      if (this.state.shapefileGeometry) {
        // Usa a geometria do shapefile que foi salva quando a camada foi criada
        console.log('=== USANDO GEOMETRIA DO SHAPEFILE ===')
        console.log('Geometria do shapefile encontrada no estado')
        
        const geometry = this.state.shapefileGeometry
        const spatialRef = geometry.spatialReference
        // Garante que está em SIRGAS 2000 (4674) para envio
        let wkid = spatialRef?.wkid || 4674
        let latestWkid = (spatialRef as any)?.latestWkid || spatialRef?.wkid || 4674
        
        // Se não estiver em 4674, força para 4674 (já deveria ter sido convertido antes)
        if (wkid !== 4674) {
          console.warn(`⚠ Geometria está em WKID ${wkid}, mas deve estar em 4674 (SIRGAS 2000)`)
          console.warn('Forçando WKID para 4674 no envio')
          wkid = 4674
          latestWkid = 4674
        }
        
        console.log('Geometria original:', geometry)
        console.log('Tipo:', geometry.type)
        console.log('SpatialReference (wkid/latestWkid):', wkid, '/', latestWkid)
        
        if (geometry.type === 'polygon') {
          const polygon = geometry as __esri.Polygon
          console.log('Rings do polígono:', polygon.rings)
          console.log('Número de rings:', polygon.rings ? polygon.rings.length : 0)
          
          // Verifica se tem rings válidos
          if (!polygon.rings || polygon.rings.length === 0 || !polygon.rings[0] || polygon.rings[0].length < 3) {
            throw new Error('A geometria do shapefile não é válida. Por favor, verifique o arquivo.')
          }
        }
        
        // Converte a geometria para JSON
        let geometryJson = geometry.toJSON()
        console.log('Geometria JSON original:', geometryJson)
        
        // Garante que os rings estão fechados (primeiro e último ponto devem ser iguais)
        if (geometry.type === 'polygon' && geometryJson.rings) {
          geometryJson.rings = geometryJson.rings.map((ring: number[][]) => {
            if (ring.length < 3) {
              throw new Error('Ring deve ter pelo menos 3 pontos')
            }
            
            // Verifica se o ring está fechado (primeiro e último ponto são iguais)
            const firstPoint = ring[0]
            const lastPoint = ring[ring.length - 1]
            const isClosed = firstPoint[0] === lastPoint[0] && firstPoint[1] === lastPoint[1]
            
            // Se não estiver fechado, adiciona o primeiro ponto no final
            if (!isClosed) {
              console.log('Ring não estava fechado. Fechando...')
              ring = [...ring, [firstPoint[0], firstPoint[1]]]
            }
            
            // Garante que cada ponto tem exatamente 2 coordenadas (x, y)
            ring = ring.map((point: number[]) => {
              if (!Array.isArray(point) || point.length < 2) {
                throw new Error('Ponto inválido no ring')
              }
              // Garante que tem exatamente 2 coordenadas (x, y)
              return [point[0], point[1]]
            })
            
            return ring
          })
        }
        
        // IMPORTANTE: A geometria dentro do feature DEVE ter seu próprio spatialReference
        // Formato exato como no exemplo fornecido
        geometryJson.spatialReference = {
          wkid: wkid,
          latestWkid: latestWkid
        }
        
        // Validação final da geometria
        if (geometry.type === 'polygon') {
          if (!geometryJson.rings || geometryJson.rings.length === 0) {
            throw new Error('Geometria de polígono não possui rings válidos')
          }
          
          // Valida cada ring
          geometryJson.rings.forEach((ring: number[][], index: number) => {
            if (!Array.isArray(ring) || ring.length < 4) { // Mínimo 4 pontos (3 + fechamento)
              throw new Error(`Ring ${index} não é válido: deve ter pelo menos 4 pontos (3 + fechamento)`)
            }
            
            // Verifica se está fechado
            const first = ring[0]
            const last = ring[ring.length - 1]
            if (first[0] !== last[0] || first[1] !== last[1]) {
              throw new Error(`Ring ${index} não está fechado corretamente`)
            }
          })
        }
        
        // Cria um GPFeatureRecordSetLayer no formato EXATO esperado pela GP tool
        // Seguindo o formato do exemplo fornecido
        const featureRecordSetLayer = {
          displayFieldName: '',
          geometryType: 'esriGeometryPolygon',
          spatialReference: {
            wkid: wkid,
            latestWkid: latestWkid
          },
          fields: [
            {
              name: 'OBJECTID',
              type: 'esriFieldTypeOID',
              alias: 'OBJECTID'
            },
            {
              name: 'Shape_Length',
              type: 'esriFieldTypeDouble',
              alias: 'Shape_Length'
            },
            {
              name: 'Shape_Area',
              type: 'esriFieldTypeDouble',
              alias: 'Shape_Area'
            }
          ],
          features: [
            {
              geometry: geometryJson, // geometryJson já tem spatialReference dentro
              attributes: {
                OBJECTID: 1,
                Shape_Length: 0,
                Shape_Area: 0
              }
            }
          ],
          exceededTransferLimit: false
        }
        
        // Validação final antes de enviar
        if (!featureRecordSetLayer.features || featureRecordSetLayer.features.length === 0) {
          throw new Error('Nenhuma feature foi adicionada ao FeatureRecordSetLayer')
        }
        
        if (!featureRecordSetLayer.features[0].geometry) {
          throw new Error('A geometria não foi adicionada ao feature')
        }
        
        if (!featureRecordSetLayer.features[0].geometry.rings || featureRecordSetLayer.features[0].geometry.rings.length === 0) {
          throw new Error('A geometria não possui rings válidos')
        }
        
        // Logs detalhados das coordenadas antes de enviar
        console.log('=== COORDENADAS DO SHAPEFILE (PRONTAS PARA ENVIO) ===')
        console.log('FeatureRecordSetLayer validado e pronto para envio')
        console.log('Número de features:', featureRecordSetLayer.features.length)
        console.log('Número de rings:', featureRecordSetLayer.features[0].geometry.rings.length)
        console.log('SpatialReference (wkid/latestWkid):', wkid, '/', latestWkid)
        
        // Mostra todas as coordenadas detalhadamente
        if (featureRecordSetLayer.features[0].geometry.rings) {
          featureRecordSetLayer.features[0].geometry.rings.forEach((ring: number[][], ringIndex: number) => {
            console.log(`--- Ring ${ringIndex + 1} (${ring.length} pontos) ---`)
            ring.forEach((point: number[], pointIndex: number) => {
              console.log(`  Ponto ${pointIndex + 1}: [${point[0]}, ${point[1]}]`)
            })
            // Mostra se o ring está fechado
            const first = ring[0]
            const last = ring[ring.length - 1]
            const isClosed = first[0] === last[0] && first[1] === last[1]
            console.log(`  Ring ${ringIndex + 1} está fechado: ${isClosed}`)
          })
        }
        
        // Mostra resumo das coordenadas
        if (featureRecordSetLayer.features[0].geometry.rings && featureRecordSetLayer.features[0].geometry.rings.length > 0) {
          const firstRing = featureRecordSetLayer.features[0].geometry.rings[0]
          console.log('--- Resumo das Coordenadas ---')
          console.log(`Total de pontos no primeiro ring: ${firstRing.length}`)
          console.log(`Primeiro ponto: [${firstRing[0][0]}, ${firstRing[0][1]}]`)
          console.log(`Último ponto: [${firstRing[firstRing.length - 1][0]}, ${firstRing[firstRing.length - 1][1]}]`)
        }
        
        // Envia como string JSON usando o nome correto do parâmetro
        const geometryValue = JSON.stringify(featureRecordSetLayer)
        params[geometryParamName] = geometryValue
        
        console.log('Geometria adicionada ao parâmetro:', geometryParamName)
        console.log('Tamanho do JSON:', geometryValue.length, 'caracteres')
      } else if (this.state.drawnGeometry) {
        // Para GPFeatureRecordSetLayer (geometria desenhada), envia JSON
        console.log('Usando GEOMETRIA DESENHADA - parâmetro:', geometryParamName)
        // Valida a geometria antes de enviar
        const geometry = this.state.drawnGeometry
        console.log('Geometria original:', geometry)
        console.log('Tipo:', geometry.type)
        
        if (geometry.type === 'polygon') {
          const polygon = geometry as __esri.Polygon
          console.log('Rings do polígono:', polygon.rings)
          console.log('Número de rings:', polygon.rings ? polygon.rings.length : 0)
          
          // Verifica se tem rings válidos
          if (!polygon.rings || polygon.rings.length === 0 || !polygon.rings[0] || polygon.rings[0].length < 3) {
            throw new Error('A geometria desenhada não é válida. Por favor, desenhe um polígono com pelo menos 3 pontos.')
          }
        }
        
        // Converte a geometria para JSON
        let geometryJson = geometry.toJSON()
        console.log('Geometria JSON original:', geometryJson)
        
        const spatialRef = geometry.spatialReference
        console.log('SpatialReference original:', spatialRef)
        
        // Obtém o WKID do spatial reference
        // IMPORTANTE: Usa o spatialReference da geometria original, não um padrão
        const wkid = spatialRef?.wkid || (spatialRef as any)?.wkText || 102100
        const latestWkid = (spatialRef as any)?.latestWkid || spatialRef?.wkid || 3857
        
        // Garante que os rings estão fechados (primeiro e último ponto devem ser iguais)
        if (geometry.type === 'polygon' && geometryJson.rings) {
          geometryJson.rings = geometryJson.rings.map((ring: number[][]) => {
            if (ring.length < 3) {
              throw new Error('Ring deve ter pelo menos 3 pontos')
            }
            
            // Verifica se o ring está fechado (primeiro e último ponto são iguais)
            const firstPoint = ring[0]
            const lastPoint = ring[ring.length - 1]
            const isClosed = firstPoint[0] === lastPoint[0] && firstPoint[1] === lastPoint[1]
            
            // Se não estiver fechado, adiciona o primeiro ponto no final
            if (!isClosed) {
              console.log('Ring não estava fechado. Fechando...')
              ring = [...ring, [firstPoint[0], firstPoint[1]]]
            }
            
            // Garante que cada ponto tem exatamente 2 coordenadas (x, y)
            ring = ring.map((point: number[]) => {
              if (!Array.isArray(point) || point.length < 2) {
                throw new Error('Ponto inválido no ring')
              }
              // Garante que tem exatamente 2 coordenadas (x, y)
              return [point[0], point[1]]
            })
            
            return ring
          })
        }
        
        // IMPORTANTE: A geometria dentro do feature DEVE ter seu próprio spatialReference
        // Formato exato como no exemplo fornecido
        geometryJson.spatialReference = {
          wkid: wkid,
          latestWkid: latestWkid
        }
        
        // Validação final da geometria
        if (geometry.type === 'polygon') {
          if (!geometryJson.rings || geometryJson.rings.length === 0) {
            throw new Error('Geometria de polígono não possui rings válidos')
          }
          
          // Valida cada ring
          geometryJson.rings.forEach((ring: number[][], index: number) => {
            if (!Array.isArray(ring) || ring.length < 4) { // Mínimo 4 pontos (3 + fechamento)
              throw new Error(`Ring ${index} não é válido: deve ter pelo menos 4 pontos (3 + fechamento)`)
            }
            
            // Verifica se está fechado
            const first = ring[0]
            const last = ring[ring.length - 1]
            if (first[0] !== last[0] || first[1] !== last[1]) {
              throw new Error(`Ring ${index} não está fechado corretamente`)
            }
          })
        }
        
        // Cria um GPFeatureRecordSetLayer no formato EXATO esperado pela GP tool
        // Seguindo o formato do exemplo fornecido
        const featureRecordSetLayer = {
          displayFieldName: '',
          geometryType: 'esriGeometryPolygon',
          spatialReference: {
            wkid: wkid,
            latestWkid: latestWkid
          },
          fields: [
            {
              name: 'OBJECTID',
              type: 'esriFieldTypeOID',
              alias: 'OBJECTID'
            },
            {
              name: 'Shape_Length',
              type: 'esriFieldTypeDouble',
              alias: 'Shape_Length'
            },
            {
              name: 'Shape_Area',
              type: 'esriFieldTypeDouble',
              alias: 'Shape_Area'
            }
          ],
          features: [
            {
              geometry: geometryJson, // geometryJson já tem spatialReference dentro
              attributes: {
                OBJECTID: 1,
                Shape_Length: 0,
                Shape_Area: 0
              }
            }
          ],
          exceededTransferLimit: false
        }
        
        // Validação final antes de enviar
        if (!featureRecordSetLayer.features || featureRecordSetLayer.features.length === 0) {
          throw new Error('Nenhuma feature foi adicionada ao FeatureRecordSetLayer')
        }
        
        if (!featureRecordSetLayer.features[0].geometry) {
          throw new Error('A geometria não foi adicionada ao feature')
        }
        
        if (!featureRecordSetLayer.features[0].geometry.rings || featureRecordSetLayer.features[0].geometry.rings.length === 0) {
          throw new Error('A geometria não possui rings válidos')
        }
        
        // Logs detalhados das coordenadas antes de enviar
        console.log('=== COORDENADAS DO DESENHO (PRONTAS PARA ENVIO) ===')
        console.log('FeatureRecordSetLayer validado e pronto para envio')
        console.log('Número de features:', featureRecordSetLayer.features.length)
        console.log('Número de rings:', featureRecordSetLayer.features[0].geometry.rings.length)
        console.log('SpatialReference (wkid/latestWkid):', wkid, '/', latestWkid)
        
        // Mostra todas as coordenadas detalhadamente
        if (featureRecordSetLayer.features[0].geometry.rings) {
          featureRecordSetLayer.features[0].geometry.rings.forEach((ring: number[][], ringIndex: number) => {
            console.log(`--- Ring ${ringIndex + 1} (${ring.length} pontos) ---`)
            ring.forEach((point: number[], pointIndex: number) => {
              console.log(`  Ponto ${pointIndex + 1}: [${point[0]}, ${point[1]}]`)
            })
            // Mostra se o ring está fechado
            const first = ring[0]
            const last = ring[ring.length - 1]
            const isClosed = first[0] === last[0] && first[1] === last[1]
            console.log(`  Ring ${ringIndex + 1} está fechado: ${isClosed}`)
          })
        }
        
        // Mostra resumo das coordenadas
        if (featureRecordSetLayer.features[0].geometry.rings && featureRecordSetLayer.features[0].geometry.rings.length > 0) {
          const firstRing = featureRecordSetLayer.features[0].geometry.rings[0]
          console.log('--- Resumo das Coordenadas ---')
          console.log(`Total de pontos no primeiro ring: ${firstRing.length}`)
          console.log(`Primeiro ponto: [${firstRing[0][0]}, ${firstRing[0][1]}]`)
          console.log(`Último ponto: [${firstRing[firstRing.length - 1][0]}, ${firstRing[firstRing.length - 1][1]}]`)
        }
        
        // Envia como string JSON usando o nome correto do parâmetro
        const geometryValue = JSON.stringify(featureRecordSetLayer)
        params[geometryParamName] = geometryValue
        
        console.log('Geometria adicionada ao parâmetro:', geometryParamName)
        console.log('Tamanho do JSON:', geometryValue.length, 'caracteres')
      }

      // Prepara form data
      let requestBody: FormData | URLSearchParams
      let contentType: string

      // IMPORTANTE: Para GPFeatureRecordSetLayer, sempre usa FormData para garantir que o JSON seja enviado corretamente
      // URLSearchParams pode codificar o JSON de forma incorreta para alguns servidores
      const hasGeometry = !!this.state.drawnGeometry || !!this.state.shapefileGeometry

      if (hasGeometry) {
        // Usa FormData para multipart/form-data (permite enviar geometria)
        requestBody = new FormData()
        
        // IMPORTANTE: Adiciona os parâmetros na ordem correta
        // Primeiro os parâmetros simples (IDEA, quantidade)
        Object.keys(params).forEach(key => {
          // Adiciona todos os parâmetros, incluindo geometria como string JSON
          const value = String(params[key])
          requestBody.append(key, value)
          if (key === geometryParamName) {
            console.log(`Geometria adicionada ao FormData: ${key} (${value.length} caracteres)`)
          } else {
            console.log(`Parâmetro adicionado ao FormData: ${key} = ${value}`)
          }
        })
        
        // IMPORTANTE: Token e f=json no body do FormData (não na URL para POST)
        // Isso se aplica tanto para shapefile quanto para sketch
        if (token) {
          requestBody.append('token', token)
          console.log('✓ Token adicionado ao FormData body (NÃO na URL)')
          console.log('Token no FormData (verificação):', requestBody.has('token'))
        } else {
          console.error('⚠ ATENÇÃO: Token não está disponível para adicionar ao FormData!')
        }
        
        // Adiciona f=json no body também
        requestBody.append('f', 'json')
        console.log('✓ f=json adicionado ao FormData body')
        
        // NÃO define Content-Type manualmente - o browser define automaticamente com boundary
        contentType = 'multipart/form-data'
        console.log('FormData preparado com', Object.keys(params).length, 'parâmetros + token + f=json')
      } else {
        // Usa URLSearchParams para application/x-www-form-urlencoded (sem geometria nem arquivo)
        requestBody = new URLSearchParams()
        
        // IMPORTANTE: Token e f=json no body do URLSearchParams (não na URL para POST)
        // Isso se aplica tanto para shapefile quanto para sketch
        requestBody.append('f', 'json')
        console.log('✓ f=json adicionado ao URLSearchParams body')
        
        if (token) {
          requestBody.append('token', token)
          console.log('✓ Token adicionado ao URLSearchParams body (NÃO na URL)')
        } else {
          console.error('⚠ ATENÇÃO: Token não está disponível para adicionar ao URLSearchParams!')
        }
        
        // Adiciona os outros parâmetros
        Object.keys(params).forEach(key => {
          requestBody.append(key, String(params[key]))
        })
        
        contentType = 'application/x-www-form-urlencoded'
        console.log('URLSearchParams preparado com', Object.keys(params).length, 'parâmetros + token + f=json')
      }

      // URL do submitJob (assíncrona) - usando a URL fornecida pelo usuário
      const taskNameEncoded = encodeURIComponent(this.GP_TASK_NAME)
      const submitJobUrl = `${this.GP_SERVICE_URL}/${taskNameEncoded}/submitJob`

      // IMPORTANTE: Para POST, o token deve ir no BODY, não na URL
      // URL limpa, sem query parameters (incluindo token)
      const finalUrl = submitJobUrl
      console.log('URL final (limpa, sem query params e sem token):', finalUrl)
      console.log('✓ Token será enviado APENAS no body, não na URL')

      const headers: any = {}
      // IMPORTANTE: Para FormData, NUNCA define Content-Type manualmente
      // O browser define automaticamente com boundary correto
      // Se definir manualmente, o boundary será incorreto e causará erro "Error parsing multi-part request"
      if (!this.state.shapefileGeometry && !this.state.drawnGeometry) {
        // Para URLSearchParams, define Content-Type explicitamente
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
      }
      // Para FormData, não define Content-Type - o browser faz isso automaticamente

      console.log('Enviando requisição para:', finalUrl)
      console.log('Parâmetros:', params)
      console.log('Token no body:', !!token)
      if (this.state.shapefileGeometry) {
        console.log('Geometria do shapefile a usar')
      }

      // Para upload de arquivo, pode precisar de credentials
      const fetchOptions: RequestInit = {
        method: 'POST',
        headers: headers,
        body: requestBody,
        // MUDANÇA: Usar 'follow' ao invés de 'manual' para permitir redirects
        // Se o servidor redirecionar, seguiremos o redirect e veremos a resposta final
        redirect: 'follow' as RequestRedirect,
        // Inclui credentials para requisições cross-origin
        credentials: 'omit' // Não inclui cookies, apenas o token na URL/body
      }

      let response: Response
      let result: any

      try {
        console.log('=== INÍCIO DA REQUISIÇÃO ===')
        console.log('URL:', finalUrl)
        console.log('Token presente na URL:', finalUrl.includes('token='), '(deve ser false)')
        console.log('Token no body:', requestBody instanceof FormData ? requestBody.has('token') : (requestBody as URLSearchParams).has('token'))
        console.log('Método:', fetchOptions.method)
        console.log('Headers:', headers)
        console.log('Body type:', requestBody instanceof FormData ? 'FormData' : 'URLSearchParams')
        
        response = await fetch(finalUrl, fetchOptions)
        
        console.log('=== RESPOSTA RECEBIDA ===')
        console.log('Status:', response.status)
        console.log('Status Text:', response.statusText)
        console.log('URL final:', response.url)
        console.log('Redirected:', response.redirected)
        console.log('Type:', response.type)
        
        // Verifica se a resposta foi um redirect para login
        if (response.redirected && response.url.includes('/login')) {
          const errorMsg = 'O servidor redirecionou para a página de login. O token pode estar expirado ou inválido.\n\n' +
            'Verifique se o token fornecido ainda é válido e tem permissão para acessar este serviço.'
          console.error(errorMsg)
          console.error('URL de redirecionamento:', response.url)
          throw new Error(errorMsg)
        }
        
        // Verifica status HTTP de erro
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('Location')
          console.warn('Status de redirecionamento:', response.status)
          console.warn('Location header:', location)
          if (location && (location.includes('/login') || location.includes('login'))) {
            throw new Error('O servidor redirecionou para a página de login. O token não está sendo aceito.\n\n' +
              'Possíveis causas:\n' +
              '1. Token expirado ou inválido\n' +
              '2. Token não tem permissão para este serviço\n' +
              '3. Servidor requer autenticação adicional\n\n' +
              'Por favor, verifique o token fornecido.')
          }
        }

        // Tenta ler como JSON
        try {
          result = await response.json()
      } catch (jsonError) {
          // Se não for JSON, lê como texto
          const textResult = await response.text()
          console.error('Resposta não é JSON:', textResult)
          
          // Verifica se é um erro de CORS ou autenticação
          if (response.status === 0 || response.type === 'opaque') {
            throw new Error('Erro de CORS: Não foi possível acessar o servidor. Verifique se você está autenticado e se o servidor permite requisições do seu domínio.')
          }
          
          if (response.status === 302 || response.status === 401 || response.status === 403) {
            throw new Error('Erro de autenticação: O servidor requer autenticação. Verifique se você está logado e se o token é válido.')
          }
          
          throw new Error(`Erro HTTP ${response.status}: ${textResult.substring(0, 200)}`)
        }

        if (!response.ok) {
          if (result && result.error) {
            // Trata erro de token inválido especificamente
            if (result.error.code === 498 || result.error.code === 401 || result.error.message?.includes('Invalid Token')) {
              throw new Error('Token inválido ou expirado (código 498). Por favor, faça login novamente no servidor ArcGIS e tente novamente.')
            }
            throw new Error(`Erro na GP: ${result.error.message || JSON.stringify(result.error)}`)
          }
          throw new Error(`Erro HTTP: ${response.status} ${response.statusText}`)
        }
        
        // Verifica se há erro mesmo com status OK (alguns servidores retornam 200 com erro)
        if (result && result.error) {
          if (result.error.code === 498 || result.error.code === 401 || result.error.message?.includes('Invalid Token')) {
            throw new Error('Token inválido ou expirado (código 498). Por favor, faça login novamente no servidor ArcGIS e tente novamente.')
          }
          throw new Error(`Erro na GP: ${result.error.message || JSON.stringify(result.error)}`)
        }
      } catch (fetchError) {
        // Trata erros de rede/CORS
        if (fetchError.name === 'TypeError' && fetchError.message.includes('Failed to fetch')) {
          console.error('Erro de rede/CORS:', fetchError)
          throw new Error('Erro de conexão: Não foi possível conectar ao servidor. Isso pode ser causado por:\n' +
            '1. Problema de CORS (Cross-Origin Resource Sharing)\n' +
            '2. Servidor requer autenticação adicional\n' +
            '3. Token de autenticação expirado ou inválido\n' +
            '4. Servidor temporariamente indisponível\n\n' +
            'Verifique o console do navegador (F12) para mais detalhes.')
        }
        throw fetchError
      }

      // Verifica se recebeu jobId
      if (!result.jobId) {
        throw new Error('Não foi possível obter jobId da resposta')
      }

      const jobId = result.jobId
      this.setState({ jobId, progress: 5 }) // Job submetido - 5%

      console.log('Job ID recebido:', jobId)
        
        // Polling do status do job
        let attempts = 0
      const maxAttempts = 120 // 2 minutos
        
        while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000)) // Verifica a cada 2 segundos
        attempts++
          
        const baseUrl = submitJobUrl.replace('/submitJob', '')
          const statusUrl = token 
            ? `${baseUrl}/jobs/${jobId}?token=${token}&f=json`
            : `${baseUrl}/jobs/${jobId}?f=json`
          
          const statusResponse = await fetch(statusUrl)
          
          if (!statusResponse.ok) {
            throw new Error(`Erro ao verificar status do job: ${statusResponse.status}`)
          }
          
        const jobStatus = await statusResponse.json()
          console.log(`Status do job (tentativa ${attempts}):`, jobStatus.jobStatus)
          
          // Calcula progresso baseado nas tentativas (5% a 95% durante polling)
          // O progresso aumenta gradualmente conforme as tentativas
          const progressPercent = Math.min(95, 5 + Math.floor((attempts / maxAttempts) * 90))
          this.setState({ progress: progressPercent })
          
          if (jobStatus.jobStatus === 'esriJobSucceeded') {
            // Job completado - sempre vai para 100% quando completa
            // Não importa quantas tentativas foram necessárias
            console.log(`Job completado após ${attempts} tentativas. Atualizando para 100%`)
            
            // Anima o progresso até 100% (incrementa gradualmente se necessário)
            const currentProgress = this.state.progress
            if (currentProgress < 100) {
              // Incrementa gradualmente até 100%
              const steps = Math.ceil((100 - currentProgress) / 5) // 5% por step
              for (let i = 1; i <= steps; i++) {
                const newProgress = Math.min(100, currentProgress + (i * 5))
                this.setState({ progress: newProgress })
                await new Promise(resolve => setTimeout(resolve, 50)) // 50ms por step
              }
            } else {
              this.setState({ progress: 100 })
            }
            // Obtém os resultados
            const resultUrl = token
              ? `${baseUrl}/jobs/${jobId}/results?token=${token}&f=json`
              : `${baseUrl}/jobs/${jobId}/results?f=json`
            
            const resultResponse = await fetch(resultUrl)
            
            if (!resultResponse.ok) {
              throw new Error(`Erro ao obter resultados: ${resultResponse.status}`)
            }
            
            result = await resultResponse.json()
            console.log('Resultado da execução assíncrona:', result)
            break
          } else if (jobStatus.jobStatus === 'esriJobFailed') {
            // Extrai mensagens de erro mais detalhadas
            let errorMessage = 'Job falhou'
            if (jobStatus.messages && Array.isArray(jobStatus.messages)) {
              const errorMessages = jobStatus.messages
                .filter((msg: any) => msg.type === 'esriJobMessageTypeError')
                .map((msg: any) => msg.description)
              
              if (errorMessages.length > 0) {
                errorMessage = errorMessages.join('\n')
              } else {
                errorMessage = JSON.stringify(jobStatus.messages)
              }
            } else if (jobStatus.messages) {
              errorMessage = JSON.stringify(jobStatus.messages)
            }
            
            console.error('Erro detalhado do job:', jobStatus.messages)
            
            // Mensagem mais amigável para o usuário
            if (errorMessage.includes('não possui geometrias válidas')) {
              throw new Error('O arquivo ZIP não contém geometrias válidas.\n\n' +
                'Por favor, verifique se:\n' +
                '1. O arquivo ZIP contém um shapefile completo (.shp, .shx, .dbf, .prj)\n' +
                '2. O shapefile possui geometrias válidas (polígonos)\n' +
                '3. O arquivo não está corrompido\n\n' +
                'Detalhes técnicos: ' + errorMessage)
            } else {
              throw new Error(`Job falhou: ${errorMessage}`)
            }
          } else if (jobStatus.jobStatus === 'esriJobCancelled') {
            throw new Error('Job foi cancelado')
          }
          
          attempts++
        }
        
        if (attempts >= maxAttempts) {
        throw new Error('Timeout: O job demorou mais de 2 minutos para completar')
      }

      // Processa o resultado
      let htmlUrl: string | null = null
      let summaryText: string | null = null

      console.log('=== PROCURANDO HTML NOS RESULTADOS ===')
      console.log('Estrutura completa do resultado:', JSON.stringify(result, null, 2))
      console.log('Tipo do resultado:', Array.isArray(result) ? 'Array' : typeof result)

      // IMPORTANTE: O resultado pode vir como array diretamente ou como objeto com results
      let resultsToCheck: any[] = []
      
      // Se result é um array diretamente
      if (Array.isArray(result)) {
        console.log('Resultado é um array, iterando diretamente...')
        resultsToCheck = result
      }
      // Se result tem uma propriedade results que é array
      else if (result.results && Array.isArray(result.results)) {
        console.log('Resultado tem results como array')
        resultsToCheck = result.results
      }
      // Se result.results é um objeto (formato antigo)
      else if (result.results && typeof result.results === 'object' && !Array.isArray(result.results)) {
        console.log('Resultado tem results como objeto, convertendo para array...')
        // Converte objeto para array de valores
        resultsToCheck = Object.values(result.results)
      }

      // Itera sobre os resultados
      if (resultsToCheck.length > 0) {
        console.log(`Verificando ${resultsToCheck.length} resultado(s)...`)
        for (let i = 0; i < resultsToCheck.length; i++) {
          const resultItem = resultsToCheck[i]
          console.log(`--- Verificando resultado ${i + 1} ---`)
          console.log('ResultItem completo:', JSON.stringify(resultItem, null, 2))
          console.log('Tipo do resultItem:', typeof resultItem)
          console.log('Tem value?', !!resultItem.value)
          console.log('Tem url?', !!resultItem.url)
          
          if (resultItem) {
            // Verifica se tem value diretamente
            if (resultItem.value) {
              const value = resultItem.value
              console.log('Value encontrado:', typeof value, value)
              
              // Se value é uma string com .html
              if (typeof value === 'string' && value.includes('.html')) {
                htmlUrl = value
                console.log(`✓✓✓ HTML encontrado em resultado[${i}].value (string):`, htmlUrl)
                break
              }
              
              // Se value é um objeto com url
              if (value && typeof value === 'object') {
                console.log('Value é um objeto, verificando propriedades:', Object.keys(value))
                if (value.url) {
                  console.log('Value.url encontrado:', typeof value.url, value.url)
                  if (typeof value.url === 'string' && value.url.includes('.html')) {
                    htmlUrl = value.url
                    console.log(`✓✓✓ HTML encontrado em resultado[${i}].value.url:`, htmlUrl)
                    break
                  }
                }
              }
            }
            
            // Verifica se tem url diretamente no resultItem
            if (resultItem.url && typeof resultItem.url === 'string' && resultItem.url.includes('.html')) {
              htmlUrl = resultItem.url
              console.log(`✓✓✓ HTML encontrado em resultado[${i}].url:`, htmlUrl)
              break
            }
            
            // Verifica se o próprio resultItem é uma string com .html
            if (typeof resultItem === 'string' && resultItem.includes('.html')) {
              htmlUrl = resultItem
              console.log(`✓✓✓ HTML encontrado em resultado[${i}] (string direta):`, htmlUrl)
              break
            }
          }
        }
      } else {
        console.warn('⚠️ Nenhum resultado para verificar!')
      }

      // Fallback: procura em outras propriedades do resultado
      if (!htmlUrl) {
        console.log('HTML não encontrado nos results, tentando fallbacks...')
        if (result.outputUrl) {
          htmlUrl = result.outputUrl
          console.log('✓ HTML encontrado em outputUrl:', htmlUrl)
        } else if (result.url) {
          htmlUrl = result.url
          console.log('✓ HTML encontrado em url:', htmlUrl)
        } else if (result.fileUrl) {
          htmlUrl = result.fileUrl
          console.log('✓ HTML encontrado em fileUrl:', htmlUrl)
        }
      }

      if (htmlUrl) {
        console.log('✅ URL do HTML encontrada:', htmlUrl)
      } else {
        console.error('❌ HTML não encontrado nos resultados!')
        console.error('Estrutura completa do resultado para debug:', JSON.stringify(result, null, 2))
      }

      // Tenta extrair o resumo do relatório HTML
      if (htmlUrl) {
        try {
          // Adiciona token à URL do HTML se necessário
          let htmlUrlWithToken = htmlUrl
          if (token && !htmlUrl.includes('token=')) {
            const separator = htmlUrl.includes('?') ? '&' : '?'
            htmlUrlWithToken = `${htmlUrl}${separator}token=${token}`
            console.log('Token adicionado à URL do HTML')
          }
          
          console.log('Acessando HTML em:', htmlUrlWithToken)
          const htmlResponse = await fetch(htmlUrlWithToken)
          
          if (!htmlResponse.ok) {
            console.error('Erro ao acessar HTML:', htmlResponse.status, htmlResponse.statusText)
            throw new Error(`Erro ao acessar HTML: ${htmlResponse.status}`)
          }
          
          const htmlText = await htmlResponse.text()
          console.log('HTML recebido, tamanho:', htmlText.length, 'caracteres')
          console.log('Primeiros 500 caracteres do HTML:', htmlText.substring(0, 500))
          
          // Remove tags HTML e normaliza espaços
          const textContent = htmlText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').toLowerCase()
          console.log('Texto extraído (primeiros 200 caracteres):', textContent.substring(0, 200))
          
          // Procura por padrões que indicam se a área é suficiente ou não
          const patterns = [
            /área\s+(?:é|está)\s+insuficiente/i,
            /área\s+insuficiente/i,
            /insuficiente.*?área/i,
            /área\s+(?:é|está)\s+suficiente/i,
            /área\s+suficiente/i,
            /suficiente.*?área/i,
            /compensação.*?insuficiente/i,
            /compensação.*?suficiente/i,
            /não\s+atende/i,
            /atende.*?requisitos/i
          ]
          
          let foundMatch = false
          for (const pattern of patterns) {
            const match = htmlText.match(pattern)
            if (match) {
              console.log('Padrão encontrado:', pattern, 'Match:', match[0])
              const isInsufficient = /insuficiente|não\s+atende/i.test(match[0])
              summaryText = isInsufficient
                ? 'Área insuficiente para compensação. Continue com a análise'
                : 'Área suficiente para compensação.'
              foundMatch = true
              console.log('Resumo extraído:', summaryText)
              break
            }
          }
          
          // Se não encontrou padrão específico, procura por palavras-chave
          if (!foundMatch) {
            console.log('Nenhum padrão específico encontrado, procurando palavras-chave...')
            const hasInsufficient = /insuficiente|não\s+atende/i.test(textContent)
            const hasSufficient = /suficiente|atende/i.test(textContent)
            
            console.log('Tem "insuficiente":', hasInsufficient)
            console.log('Tem "suficiente":', hasSufficient)
            
            if (hasInsufficient && !hasSufficient) {
              summaryText = 'Área insuficiente para compensação'
              console.log('Resumo definido como insuficiente')
            } else if (hasSufficient && !hasInsufficient) {
              summaryText = 'Área suficiente para compensação'
              console.log('Resumo definido como suficiente')
            } else {
              console.warn('Não foi possível determinar se a área é suficiente ou insuficiente')
            }
          }
        } catch (htmlError) {
          console.warn('Não foi possível extrair resumo do HTML:', htmlError)
        }
      }

      // Atualiza o estado com os resultados
      // Usa a URL com token se foi adicionado
      const finalReportUrl = htmlUrl && token && !htmlUrl.includes('token=')
        ? `${htmlUrl}${htmlUrl.includes('?') ? '&' : '?'}token=${token}`
        : htmlUrl
      
      this.setState({
        loading: false,
        progress: 100, // Análise completa
        reportUrl: finalReportUrl,
        analysisResult: summaryText ? {
          sufficient: !summaryText.toLowerCase().includes('insuficiente'),
          message: summaryText
        } : null
      })

      if (!htmlUrl) {
        console.error('❌ ATENÇÃO: HTML não foi encontrado!')
        console.error('Estrutura do resultado:', JSON.stringify(result, null, 2))
        alert('Análise concluída, mas não foi possível encontrar a URL do relatório. Verifique o console para mais detalhes.')
      } else {
        console.log('✅ HTML encontrado e salvo no estado. Botão de baixar relatório deve estar habilitado.')
      }

    } catch (error) {
      console.error('Erro ao executar análise:', error)
      alert(`Erro ao executar análise: ${error.message}\n\nVerifique o console (F12) para mais detalhes.`)
      this.setState({ loading: false })
    }
  }

  render () {
    const style = css`
      &.widget-calculadora-barreiras {
        .widget-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 8px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .form-group label {
          font-weight: 500;
          font-size: 14px;
          color: #212121;
        }
        input[type="number"],
        input[type="text"],
        input[type="file"] {
          padding: 8px;
          border: 1px solid #ccc;
          border-radius: 20px;
          font-size: 14px;
          background-color: white;
          color: #212121;
        }
        input[type="number"] {
          width: 80px;
        }
        input[type="file"] {
          padding: 6px 8px;
        }
        .idea-inputs {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 8px;
        }
        .idea-input-item {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .idea-input-item label {
          min-width: 80px;
          font-size: 13px;
          color: #212121;
        }
        .idea-input-item input {
          flex: 1;
        }
        button {
          padding: 8px 16px;
          border: none;
          border-radius: 20px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-weight: 500;
          &:disabled {
            background-color: #e0e0e0;
            color: #9e9e9e;
            cursor: not-allowed;
            opacity: 1;
          }
        }
        .btn-primary {
          background-color: #266640;
          color: white;
          &:hover:not(:disabled) {
            background-color: #1e4f32;
          }
          &:disabled {
            background-color: #e0e0e0;
            color: #9e9e9e;
          }
        }
        .btn-secondary {
          background-color: #266640;
          color: white;
          &:hover:not(:disabled) {
            background-color: #1e4f32;
          }
          &:disabled {
            background-color: #e0e0e0;
            color: #9e9e9e;
          }
        }
        .btn-success {
          background-color: #e0e0e0;
          color: #424242;
          &:hover:not(:disabled) {
            background-color: #bdbdbd;
            color: #212121;
          }
          &:disabled {
            background-color: #e0e0e0;
            color: #9e9e9e;
          }
        }
        .btn-danger {
          background-color: #e0e0e0;
          color: #424242;
          &:hover:not(:disabled) {
            background-color: #bdbdbd;
            color: #212121;
          }
          &:disabled {
            background-color: #e0e0e0;
            color: #9e9e9e;
          }
        }
        .button-group {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .summary-box {
          padding: 12px;
          border-radius: 20px;
          margin-top: 12px;
          font-size: 14px;
        }
        .summary-box.sufficient {
          background-color: #d4edda;
          border: 1px solid #c3e6cb;
          color: #155724;
        }
        .summary-box.insufficient {
          background-color: #f8d7da;
          border: 1px solid #f5c6cb;
          color: #721c24;
        }
        .spinner {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          border-top-color: white;
          animation: spin 0.8s linear infinite;
          margin-right: 8px;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        .file-info {
          font-size: 12px;
          color: #666;
          margin-top: 4px;
        }
        .drawing-info {
          font-size: 12px;
          color: #0079c1;
          margin-top: 4px;
          font-style: italic;
        }
      }
    `

    const canRunAnalysis = 
      this.state.ideaValues.every(val => val && val.trim() !== '') &&
      (this.state.shapefileGeometry || this.state.drawnGeometry) &&
      !this.state.loading

    return (
      <div className="widget-calculadora-barreiras jimu-widget" css={style}>
        {this.props.hasOwnProperty('useMapWidgetIds') &&
          this.props.useMapWidgetIds &&
          this.props.useMapWidgetIds.length === 1 && (
            <JimuMapViewComponent
              useMapWidgetId={this.props.useMapWidgetIds?.[0]}
              onActiveViewChange={(jmv: JimuMapView) => {
                this.setState({
                  jimuMapView: jmv
                })
              }}
            />
        )}

        <div className="widget-container">

          {/* Quantidade de códigos de alerta */}
          <div className="form-group">
            <label>
              {defaultMessages.quantidadeIDEA}
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={this.state.quantidadeIDEA}
              onChange={this.handleQuantidadeIDEAChange}
              disabled={this.state.loading}
            />
          </div>

          {/* Campos dinâmicos de código de alerta */}
          <div className="idea-inputs">
            {this.state.ideaValues.map((value, index) => (
              <div key={index} className="idea-input-item">
                <label>Código {index + 1}:</label>
              <input
                type="text"
                  value={value}
                  onChange={(e) => this.handleIdeaValueChange(index, e.target.value)}
                  placeholder={`Código do alerta ${index + 1}`}
                  disabled={this.state.loading}
                />
              </div>
            ))}
          </div>

          {/* Upload de Shapefile */}
          <div className="form-group">
            <label>
              {defaultMessages.areaPropostaShapefile}
            </label>
            <input
              id="shapefile-upload"
              type="file"
              accept=".zip"
              onChange={this.handleShapefileUpload}
              disabled={this.state.loading || !!this.state.drawnGeometry}
            />
            {this.state.shapefileLayer && (
              <div className="file-info">
                Camada: {this.state.shapefileLayer.title || 'Área Proposta'}
              </div>
            )}
            {this.state.drawnGeometry && (
              <div className="file-info" style={{ color: '#dc3545' }}>
                Desenho no mapa ativo. Remova o desenho para fazer upload de shapefile.
              </div>
            )}
          </div>

          {/* Desenho no Mapa */}
          <div className="form-group">
            <label>
              {defaultMessages.areaPropostaDesenho}
            </label>
              <button 
              className="btn-secondary"
              onClick={this.handleStartDrawing}
              disabled={this.state.loading || this.state.drawingMode || !!this.state.shapefileGeometry}
              >
              {this.state.drawingMode ? 'Desenhando...' : defaultMessages.iniciarDesenho}
              </button>
            {this.state.drawingMode && (
              <div className="drawing-info">
                Clique no mapa para começar a desenhar a área.
            </div>
            )}
            {this.state.drawnGeometry && (
              <div className="file-info" style={{ color: '#28a745' }}>
                Área desenhada no mapa.
              </div>
            )}
            {this.state.shapefileGeometry && (
              <div className="file-info" style={{ color: '#dc3545' }}>
                Shapefile carregado. Remova o arquivo para desenhar no mapa.
              </div>
            )}
          </div>

          {/* Botões de Ação */}
          <div className="button-group">
              <button
              className="btn-primary"
              onClick={this.handleRunAnalysis}
              disabled={!canRunAnalysis}
              >
                {this.state.loading && (
                  <span className="spinner"></span>
                )}
              {defaultMessages.executarAnalise}
              </button>
              <button
              className="btn-danger"
              onClick={this.handleClearAnalysis}
                disabled={this.state.loading}
              >
              {defaultMessages.limparAnalise}
              </button>
            <button
              className="btn-success"
              onClick={this.handleDownloadReport}
              disabled={!this.state.reportUrl || this.state.loading}
            >
              {defaultMessages.baixarRelatorio}
            </button>
          </div>

          {/* Resumo da Análise */}
          {this.state.analysisResult && (
            <div className={`summary-box ${this.state.analysisResult.sufficient ? 'sufficient' : 'insufficient'}`}>
              <strong>Resumo da Análise:</strong><br />
              {this.state.analysisResult.message}
            </div>
          )}
        </div>
      </div>
    )
  }
}
