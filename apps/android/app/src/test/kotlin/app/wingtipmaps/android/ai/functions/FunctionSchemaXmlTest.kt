package app.wingtipmaps.android.ai.functions

import org.junit.Assert.assertEquals
import org.junit.Test

/** The compiler's schema read back as Gemini Nano's tools, in the shape
 *  appfunctions-compiler 1.0.0-rc01 writes it. */
class FunctionSchemaXmlTest {
    private val xml = """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <appfunctions>
          <appfunction>
            <id>app.wingtipmaps.android.ai.functions.WingtipFunctions#planRoute</id>
            <description>Plans a route.</description>
            <parameters>
              <dataTypeMetadata><isNullable>false</isNullable><type>8</type></dataTypeMetadata>
              <isRequired>true</isRequired><name>dep</name><description>The departure.</description>
            </parameters>
            <parameters>
              <dataTypeMetadata>
                <isNullable>false</isNullable>
                <itemType><isNullable>false</isNullable><type>8</type></itemType>
                <type>10</type>
              </dataTypeMetadata>
              <isRequired>true</isRequired><name>stops</name><description>The stops.</description>
            </parameters>
            <response><valueType><type>11</type></valueType></response>
            <functionId>app.wingtipmaps.android.ai.functions.WingtipFunctions#planRoute</functionId>
          </appfunction>
          <appfunction>
            <functionId>app.wingtipmaps.android.ai.functions.WingtipFunctions#logbookFlights</functionId>
            <description>Lists flights.</description>
            <parameters>
              <dataTypeMetadata><type>7</type></dataTypeMetadata>
              <isRequired>true</isRequired><name>count</name><description>How many.</description>
            </parameters>
          </appfunction>
        </appfunctions>
    """.trimIndent()

    @Test
    fun readsEachFunctionWithItsParameters() {
        val tools = FunctionSchemaXml.read(xml.byteInputStream())
        assertEquals(listOf("planRoute", "logbookFlights"), tools.map { it.name })
        val plan = tools.first()
        assertEquals("Plans a route.", plan.description)
        assertEquals(
            listOf(
                FunctionSchemaXml.Param("dep", "The departure.", FunctionSchemaXml.Kind.STRING, true),
                FunctionSchemaXml.Param("stops", "The stops.", FunctionSchemaXml.Kind.STRING_LIST, true),
            ),
            plan.params,
        )
        assertEquals(FunctionSchemaXml.Kind.INT, tools[1].params.single().kind)
    }

    @Test
    fun everyFunctionHasAToolInTheApp() {
        // Each of WingtipFunctions' functions is answered in Ask too
        // (AgentTools.dispatch): the names the compiler writes are its methods'.
        val declared = WingtipFunctions::class.java.declaredMethods.map { it.name }.toSet()
        val answered = setOf(
            "findAirport", "searchAirports", "nearestAirports", "airportFrequencies", "airportApproaches", "plannedRoute",
            "routeNotams", "briefVerdict", "myAirplanes", "logbookFlights", "openScreen", "planRoute", "showAirport", "openEmergency",
        )
        assertEquals(answered, declared.intersect(answered))
    }
}
