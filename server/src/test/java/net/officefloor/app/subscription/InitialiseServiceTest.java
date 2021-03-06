/*
 * OfficeFloor - http://www.officefloor.net
 * Copyright (C) 2005-2019 Daniel Sagenschneider
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
package net.officefloor.app.subscription;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.RuleChain;

import net.officefloor.app.subscription.InitialiseService.Initialisation;
import net.officefloor.app.subscription.store.Administration;
import net.officefloor.app.subscription.store.Administration.Administrator;
import net.officefloor.nosql.objectify.mock.ObjectifyRule;
import net.officefloor.server.http.HttpException;
import net.officefloor.server.http.HttpStatus;
import net.officefloor.woof.mock.MockWoofResponse;
import net.officefloor.woof.mock.MockWoofServer;
import net.officefloor.woof.mock.MockWoofServerRule;

/**
 * Tests the {@link InitialiseService}.
 * 
 * @author Daniel Sagenschneider
 */
public class InitialiseServiceTest {

	private ObjectifyRule obectify = new ObjectifyRule();

	private MockWoofServerRule server = new MockWoofServerRule();

	@Rule
	public RuleChain chain = RuleChain.outerRule(this.obectify).around(this.server);

	private TestHelper helper = new TestHelper(this.obectify);

	@Test
	public void retrieveInitialisation() throws Exception {

		// Store configuration
		this.helper.setupAdministration();

		// Ensure able to obtain initialisation from configuration
		MockWoofResponse response = this.server
				.send(MockWoofServer.mockRequest("/initialise").secure(true).header("Accept", "application/json"));
		response.assertJson(200,
				new Initialisation(true, "MOCK_GOOGLE_CLIENT_ID", "MOCK_PAYPAL_CLIENT_ID", "MOCK_PAYPAL_CURRENCY"));
	}

	@Test
	public void notYetInitialised() throws Exception {
		MockWoofResponse response = this.server
				.send(MockWoofServer.mockRequest("/initialise").secure(true).header("Accept", "application/json"));
		response.assertJsonError(new HttpException(HttpStatus.INTERNAL_SERVER_ERROR, "Application not configured"));
	}

	@Test
	public void startupInitialisationFromFileSystem() throws Exception {
		String initialiseFilePath = "./src/test/resources/" + this.getClass().getPackage().getName().replace('.', '/')
				+ "/administration.json";
		assertTrue("INVALID TEST: can not find intialisation file", Files.exists(Paths.get(initialiseFilePath)));
		this.startupInitialisation(initialiseFilePath);
	}

	@Test
	public void startupInitialisationFromClasspath() throws Exception {
		String initialiseFilePath = this.getClass().getPackage().getName().replace('.', '/') + "/administration.json";
		assertNotNull("INVALID TEST: Can not find initialisation file",
				this.getClass().getClassLoader().getResourceAsStream(initialiseFilePath));
		this.startupInitialisation("classpath://" + initialiseFilePath);
	}

	private void startupInitialisation(String initialiseFilePath) throws Exception {

		// Ensure reset property
		String resetFilePath = System.getProperty(InitialiseService.PROPERTY_INITIALISE_FILE_PATH);
		System.setProperty(InitialiseService.PROPERTY_INITIALISE_FILE_PATH, initialiseFilePath);
		try {

			// Ensure initialise from file
			MockWoofResponse response = this.server
					.send(MockWoofServer.mockRequest("/initialise").secure(true).header("Accept", "application/json"));
			response.assertJson(200,
					new Initialisation(true, "MOCK_GOOGLE_CLIENT_ID", "MOCK_PAYPAL_CLIENT_ID", "MOCK_PAYPAL_CURRENCY"));

		} finally {
			if (resetFilePath == null) {
				System.clearProperty(InitialiseService.PROPERTY_INITIALISE_FILE_PATH);
			} else {
				System.setProperty(InitialiseService.PROPERTY_INITIALISE_FILE_PATH, resetFilePath);
			}
		}

		// Ensure the configuration loaded to database
		Administration admin = this.obectify.get(Administration.class);
		assertEquals("MOCK_GOOGLE_CLIENT_ID", admin.getGoogleClientId());
		Administrator[] expectedAdministrators = new Administrator[] {
				new Administrator("MOCK_ADMIN_1", "MOCK_NOTES_1"), new Administrator("MOCK_ADMIN_2", "MOCK_NOTES_2") };
		Administrator[] administrators = admin.getAdministrators();
		assertEquals("Incorrect number of administrators", expectedAdministrators.length, administrators.length);
		for (int i = 0; i < expectedAdministrators.length; i++) {
			assertEquals(expectedAdministrators[i].getGoogleId(), administrators[i].getGoogleId());
			assertEquals(expectedAdministrators[i].getNotes(), administrators[i].getNotes());
		}
		assertEquals("sandbox", admin.getPaypalEnvironment());
		assertEquals("MOCK_PAYPAL_CLIENT_ID", admin.getPaypalClientId());
		assertEquals("MOCK_PAYPAL_CLIENT_SECRET", admin.getPaypalClientSecret());
		assertEquals("MOCK_INVOICE_{id}_{timestamp}", admin.getPaypalInvoiceIdTemplate());
		assertEquals("MOCK_PAYPAL_CURRENCY", admin.getPaypalCurrency());
	}

}