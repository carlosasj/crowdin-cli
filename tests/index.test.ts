import fs from "fs";
import CrowdinApiClient, { Credentials } from "@crowdin/crowdin-api-client";
import expectedJson from "./fixtures/expected.json";
import config from "../src/config";
import program from "../src/cli";
import collect from "../src/collect";
import download from "../src/download";
import upload from "../src/upload";
import deleteBranch from "../src/delete-branch";

jest.mock("@crowdin/crowdin-api-client", () =>
  jest.fn().mockReturnValue({
    uploadStorageApi: {
      addStorage: jest.fn().mockResolvedValue({
        data: { id: 324234 },
      }),
    },
    translationsApi: {
      exportProjectTranslation: jest.fn().mockResolvedValue({
        data: { url: "https://example.com/mock.json" },
      }),
    },
    sourceFilesApi: {
      listProjectBranches: jest.fn().mockResolvedValue({
        data: [{ data: { id: 3235234 } }],
      }),
      listProjectFiles: jest.fn().mockResolvedValue({
        data: [{ data: { id: 234234 } }],
      }),
      updateOrRestoreFile: jest.fn().mockResolvedValue({
        data: { id: 234234 },
      }),
      createBranch: jest.fn().mockResolvedValue({
        data: { id: 234234, name: "mock-branch-name" },
      }),
      createFile: jest.fn().mockResolvedValue({
        data: { id: 234234 },
      }),
    },
  })
);

jest.mock(
  "axios",
  jest.fn().mockReturnValue({
    get: jest.fn().mockResolvedValue({
      data: {
        "mollie-crowdin-content": { message: "Dit is een test" },
        "mollie-crowdin-title": { message: "Hi" },
      },
    }),
  })
);

jest.mock(
  "fs",
  jest.fn().mockReturnValue({
    ...jest.requireActual("fs"),
    createReadStream: jest.fn().mockReturnValue("mockReadStream"),
  })
);

jest.mock("../src/collect", () => {
  return {
    __esModule: true,
    default: jest.fn(jest.requireActual("../src/collect").default),
  };
});

jest.mock("../src/upload", () => {
  return {
    __esModule: true,
    default: jest.fn(jest.requireActual("../src/upload").default),
  };
});

jest.mock("../src/download", () => {
  return {
    __esModule: true,
    default: jest.fn(jest.requireActual("../src/download").default),
  };
});

jest.mock("../src/delete-branch", () => {
  return {
    __esModule: true,
    default: jest.fn(jest.requireActual("../src/delete-branch").default),
  };
});

describe("CLI", () => {
  const mockGlob = "./tests/fixtures/**.tsx";

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("correctly handles `collect` command", async () => {
    await program(["node", "test", "collect", mockGlob]);
    expect(collect).toHaveBeenCalledTimes(1);
    expect(collect).toHaveBeenCalledWith(mockGlob);
  });

  it("correctly handles `upload` command", async () => {
    await program(["node", "test", "upload", mockGlob]);
    expect(collect).toHaveBeenCalledTimes(1);
    expect(collect).toHaveBeenCalledWith(mockGlob);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("correctly handles `download` command", async () => {
    await program(["node", "test", "download"]);
    expect(download).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledWith(false);
    await program(["node", "test", "download", "--typescript"]);
    expect(download).toHaveBeenCalledTimes(2);
    expect(download).toHaveBeenCalledWith(true);
  });

  it("correctly handles `delete-branch` command", async () => {
    await program(["node", "test", "delete-branch"]);
    expect(deleteBranch).toHaveBeenCalledTimes(1);
  });
});

describe("Handlers", () => {
  beforeEach(() => {
    // Remove directories created in tests
    fs.rmdirSync("tests/intl", { recursive: true });
    fs.rmdirSync("tests/messages", { recursive: true });
    fs.rmdirSync("tests/src", { recursive: true });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("collects messages correctly", async () => {
    expect.assertions(2);

    // Collects all messages from a component and creates english.source.json
    await collect("./tests/fixtures/**.tsx");
    expect(
      fs.existsSync(`${config.INTL_DIR}/english.source.json`)
    ).toBeTruthy();

    // english.source.json matches the expected JSON file
    const sourceJson = require(`${config.INTL_DIR}/english.source.json`);
    expect(sourceJson).toEqual(expectedJson);
  });

  it("creates a branch on Crowdin and uploads the collected messages", async () => {
    expect.assertions(6);

    const credentials: Credentials = {
      token: config.CROWDIN_PERSONAL_ACCESS_TOKEN,
    };
    const { sourceFilesApi, uploadStorageApi } = new CrowdinApiClient(
      credentials
    );

    await upload();

    expect(sourceFilesApi.createBranch).toHaveBeenCalledTimes(1);
    expect(sourceFilesApi.createBranch).toHaveBeenCalledWith(
      config.CROWDIN_PROJECT_ID,
      {
        name: config.BRANCH_NAME,
      }
    );

    expect(uploadStorageApi.addStorage).toHaveBeenCalledTimes(1);
    expect(uploadStorageApi.addStorage).toHaveBeenCalledWith(
      config.FILE_NAME,
      "mockReadStream"
    );

    expect(sourceFilesApi.listProjectBranches).toHaveBeenCalledTimes(1);
    expect(sourceFilesApi.listProjectBranches).toHaveBeenCalledWith(
      config.CROWDIN_PROJECT_ID,
      "mock-branch-name"
    );
  });

  it("downloads messages of the specified branch from Crowdin", async () => {
    expect.assertions(1);
    await collect("./tests/fixtures/**.tsx");
    await download();
    const file = fs.readFileSync(`${config.TRANSLATIONS_DIR}/nl.js`).toString();
    expect(file).toMatchSnapshot();
  });
});
